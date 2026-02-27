import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { marginbites } from '@/api/marginbitesClient';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Plus, Search, Filter, ShoppingCart, Send, Eye,
  CheckCircle2, Clock, XCircle, Package, Sparkles,
  Loader2, Mail, MessageSquare, FileText
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

const statusConfig = {
  Draft: { label: 'Borrador', color: 'bg-slate-100 text-slate-700', icon: FileText },
  Suggested: { label: 'Sugerido', color: 'bg-purple-100 text-purple-700', icon: Sparkles },
  Sent: { label: 'Enviado', color: 'bg-blue-100 text-blue-700', icon: Send },
  Partially_Received: { label: 'Parcial', color: 'bg-amber-100 text-amber-700', icon: Package },
  Received: { label: 'Recibido', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  Cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-700', icon: XCircle },
};

export default function PurchaseOrders({ selectedLocationId }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showSuggestDialog, setShowSuggestDialog] = useState(false);
  const [generating, setGenerating] = useState(false);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['purchaseOrders', selectedLocationId, statusFilter],
    queryFn: async () => {
      if (!selectedLocationId) return [];
      const filters = { location_id: selectedLocationId };
      if (statusFilter !== 'all') filters.status = statusFilter;
      return marginbites.entities.PurchaseOrder.filter(filters, '-order_date', 50);
    },
    enabled: !!selectedLocationId
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => marginbites.entities.Supplier.filter({ is_active: true }),
  });

  const { data: stockData = [] } = useQuery({
    queryKey: ['stockForSuggestions', selectedLocationId],
    queryFn: async () => {
      if (!selectedLocationId) return [];
      return marginbites.entities.StockOnHand.filter({ 
        location_id: selectedLocationId,
        needs_reorder: true 
      });
    },
    enabled: !!selectedLocationId
  });

  const generateSuggestionsMutation = useMutation({
    mutationFn: async () => {
      // Simular generación de sugerencias de pedido
      const products = await marginbites.entities.Product.filter({ is_active: true });
      const stockMap = {};
      stockData.forEach(s => { stockMap[s.product_id] = s; });
      
      // Agrupar por proveedor
      const bySupplier = {};
      for (const prod of products) {
        const stock = stockMap[prod.id];
        if (stock?.needs_reorder || !stock) {
          const supplierId = prod.default_supplier_id;
          if (!supplierId) continue;
          if (!bySupplier[supplierId]) bySupplier[supplierId] = [];
          bySupplier[supplierId].push({
            product: prod,
            currentStock: stock?.quantity_base || 0,
            suggestedQty: 10, // MVP: cantidad fija, luego calcular
            avgPrice: prod.avg_price || 0
          });
        }
      }

      // Crear POs sugeridas
      const poCount = await marginbites.entities.PurchaseOrder.list('-created_date', 1);
      let poNum = poCount.length > 0 ? parseInt(poCount[0].po_number?.split('-')[2] || '0') + 1 : 1;

      for (const [supplierId, items] of Object.entries(bySupplier)) {
        const supplier = suppliers.find(s => s.id === supplierId);
        if (!supplier || items.length === 0) continue;

        const po = await marginbites.entities.PurchaseOrder.create({
          po_number: `PO-${new Date().getFullYear()}-${String(poNum++).padStart(4, '0')}`,
          location_id: selectedLocationId,
          supplier_id: supplierId,
          supplier_name: supplier.name,
          order_date: format(new Date(), 'yyyy-MM-dd'),
          status: 'Suggested',
          source: 'auto_suggestion',
          total_estimated_amount: items.reduce((sum, i) => sum + i.suggestedQty * i.avgPrice, 0),
          lines_count: items.length
        });

        for (const item of items) {
          await marginbites.entities.POLine.create({
            purchase_order_id: po.id,
            po_number: po.po_number,
            product_id: item.product.id,
            product_name: item.product.product_name,
            product_sku: item.product.sku,
            unit_id: item.product.purchase_unit_id || item.product.base_unit_id,
            unit_code: item.product.purchase_unit_code || item.product.base_unit_code,
            suggested_qty: item.suggestedQty,
            ordered_qty: item.suggestedQty,
            unit_price_estimated: item.avgPrice,
            line_total_estimated: item.suggestedQty * item.avgPrice,
            suggestion_reason: `Stock actual: ${item.currentStock.toFixed(1)}`,
            line_status: 'Open'
          });
        }
      }

      return Object.keys(bySupplier).length;
    },
    onSuccess: (count) => {
      toast.success(`Se crearon ${count} pedidos sugeridos`);
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      setShowSuggestDialog(false);
    },
    onError: (error) => {
      toast.error('Error al generar sugerencias');
      console.error(error);
    }
  });

  const sendOrderMutation = useMutation({
    mutationFn: async ({ orderId, channel }) => {
      await marginbites.entities.PurchaseOrder.update(orderId, {
        status: 'Sent',
        sent_via: channel,
        sent_at: new Date().toISOString()
      });
      // Aquí iría la integración real de envío
      toast.success(`Pedido enviado por ${channel === 'email' ? 'email' : 'WhatsApp'}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
    }
  });

  const filteredOrders = orders.filter(order => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      order.po_number?.toLowerCase().includes(term) ||
      order.supplier_name?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-slate-500">
            Gestiona los pedidos a proveedores y genera sugerencias automáticas
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={() => setShowSuggestDialog(true)}
            className="gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Generar Sugerencias
          </Button>
          <Link to={createPageUrl('PONew')}>
            <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4" />
              Nuevo Pedido
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por número o proveedor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filtrar por estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="Draft">Borrador</SelectItem>
                <SelectItem value="Suggested">Sugerido</SelectItem>
                <SelectItem value="Sent">Enviado</SelectItem>
                <SelectItem value="Partially_Received">Parcialmente Recibido</SelectItem>
                <SelectItem value="Received">Recibido</SelectItem>
                <SelectItem value="Cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Pedido</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Total Estimado</TableHead>
                  <TableHead>Líneas</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                    </TableCell>
                  </TableRow>
                ) : filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-slate-500">
                      No hay pedidos para mostrar
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map(order => {
                    const status = statusConfig[order.status] || statusConfig.Draft;
                    const StatusIcon = status.icon;
                    return (
                      <TableRow key={order.id} className="hover:bg-slate-50">
                        <TableCell className="font-medium">
                          <Link 
                            to={createPageUrl('PODetail') + `?id=${order.id}`}
                            className="text-emerald-600 hover:underline"
                          >
                            {order.po_number}
                          </Link>
                        </TableCell>
                        <TableCell>{order.supplier_name}</TableCell>
                        <TableCell>
                          {order.order_date ? format(new Date(order.order_date), 'dd/MM/yyyy') : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${status.color} gap-1`}>
                            <StatusIcon className="w-3 h-3" />
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {order.total_estimated_amount?.toLocaleString('es-ES', { 
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2 
                          })}€
                        </TableCell>
                        <TableCell>{order.lines_count || 0}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Link to={createPageUrl('PODetail') + `?id=${order.id}`}>
                              <Button variant="ghost" size="icon">
                                <Eye className="w-4 h-4" />
                              </Button>
                            </Link>
                            {['Draft', 'Suggested'].includes(order.status) && (
                              <>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => sendOrderMutation.mutate({ orderId: order.id, channel: 'email' })}
                                >
                                  <Mail className="w-4 h-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => sendOrderMutation.mutate({ orderId: order.id, channel: 'whatsapp' })}
                                >
                                  <MessageSquare className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Suggest Dialog */}
      <Dialog open={showSuggestDialog} onOpenChange={setShowSuggestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generar Sugerencias de Pedido</DialogTitle>
            <DialogDescription>
              Se analizará el stock actual y las ventas recientes para sugerir pedidos óptimos a cada proveedor.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-lg">
              <Sparkles className="w-5 h-5 text-amber-600" />
              <div>
                <p className="font-medium text-amber-800">Productos con stock bajo detectados</p>
                <p className="text-sm text-amber-600">{stockData.length} productos necesitan reposición</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSuggestDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => generateSuggestionsMutation.mutate()}
              disabled={generateSuggestionsMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {generateSuggestionsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generar Sugerencias
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}