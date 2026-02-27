import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { marginbites } from '@/api/marginbitesClient';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import {
  Search, Filter, Warehouse, AlertTriangle, CheckCircle2,
  ArrowUpDown, Package, TrendingDown, Plus, History,
  Loader2, XCircle, Euro
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

export default function Stock({ selectedLocationId, user }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [adjustmentData, setAdjustmentData] = useState({ quantity: '', notes: '' });
  const [activeTab, setActiveTab] = useState('stock');

  const { data: stockData = [], isLoading: loadingStock } = useQuery({
    queryKey: ['stockOnHand', selectedLocationId],
    queryFn: async () => {
      if (!selectedLocationId) return [];
      return marginbites.entities.StockOnHand.filter({ location_id: selectedLocationId });
    },
    enabled: !!selectedLocationId
  });

  const { data: movements = [], isLoading: loadingMovements } = useQuery({
    queryKey: ['ledgerMovements', selectedLocationId],
    queryFn: async () => {
      if (!selectedLocationId) return [];
      return marginbites.entities.LedgerMovement.filter(
        { location_id: selectedLocationId },
        '-movement_date',
        100
      );
    },
    enabled: !!selectedLocationId && activeTab === 'movements'
  });

  const adjustmentMutation = useMutation({
    mutationFn: async ({ productId, quantity, notes }) => {
      const stock = stockData.find(s => s.product_id === productId);
      const movementType = quantity >= 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
      
      const movCount = await marginbites.entities.LedgerMovement.list('-created_date', 1);
      const movNum = movCount.length > 0 ? parseInt(movCount[0].movement_number?.split('-')[2] || '0') + 1 : 1;

      await marginbites.entities.LedgerMovement.create({
        movement_number: `MOV-${new Date().getFullYear()}-${String(movNum).padStart(6, '0')}`,
        movement_date: format(new Date(), 'yyyy-MM-dd'),
        location_id: selectedLocationId,
        product_id: productId,
        product_name: stock?.product_name,
        product_sku: stock?.product_sku,
        movement_type: movementType,
        quantity: Math.abs(quantity),
        unit_code: stock?.base_unit_code || 'kg',
        quantity_base: Math.abs(quantity),
        unit_cost: stock?.avg_cost || 0,
        total_cost: Math.abs(quantity) * (stock?.avg_cost || 0),
        reference_type: 'Manual_Adjustment',
        reference_number: `ADJ-${Date.now()}`,
        notes
      });

      // Actualizar stock
      const newQty = (stock?.quantity_base || 0) + quantity;
      if (stock) {
        await marginbites.entities.StockOnHand.update(stock.id, {
          quantity_base: newQty,
          total_value: newQty * (stock.avg_cost || 0),
          is_negative: newQty < 0,
          last_movement_at: new Date().toISOString()
        });
      }

      // Registrar auditoría
      await marginbites.entities.AuditLog.create({
        actor_user_id: user?.id,
        actor_email: user?.email,
        actor_name: user?.full_name,
        action_type: 'update',
        entity_type: 'StockOnHand',
        entity_id: stock?.id,
        description: `Ajuste manual de stock: ${quantity} ${stock?.base_unit_code}. Motivo: ${notes}`,
        location_id: selectedLocationId
      });
    },
    onSuccess: () => {
      toast.success('Ajuste de stock registrado');
      queryClient.invalidateQueries({ queryKey: ['stockOnHand'] });
      queryClient.invalidateQueries({ queryKey: ['ledgerMovements'] });
      setShowAdjustDialog(false);
      setAdjustmentData({ quantity: '', notes: '' });
      setSelectedProduct(null);
    },
    onError: () => {
      toast.error('Error al registrar el ajuste');
    }
  });

  const categories = ['all', 'Carne', 'Pescado', 'Verduras', 'Lacteos', 'Secos', 'Bebidas', 'Otros'];

  const filteredStock = stockData.filter(item => {
    const matchesSearch = !searchTerm || 
      item.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.product_sku?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || item.product_category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const totalValue = stockData.reduce((sum, s) => sum + (s.total_value || 0), 0);
  const negativeCount = stockData.filter(s => s.is_negative).length;
  const lowStockCount = stockData.filter(s => s.needs_reorder).length;

  const openAdjustDialog = (product) => {
    setSelectedProduct(product);
    setAdjustmentData({ quantity: '', notes: '' });
    setShowAdjustDialog(true);
  };

  const handleAdjust = () => {
    if (!adjustmentData.quantity || !adjustmentData.notes) {
      toast.error('Completa todos los campos');
      return;
    }
    adjustmentMutation.mutate({
      productId: selectedProduct.product_id,
      quantity: parseFloat(adjustmentData.quantity),
      notes: adjustmentData.notes
    });
  };

  const movementTypeLabels = {
    GRN_IN: { label: 'Entrada GRN', color: 'bg-emerald-100 text-emerald-700' },
    CONSUMPTION_OUT: { label: 'Consumo', color: 'bg-blue-100 text-blue-700' },
    WASTE_OUT: { label: 'Merma', color: 'bg-red-100 text-red-700' },
    TRANSFER_IN: { label: 'Transfer IN', color: 'bg-purple-100 text-purple-700' },
    TRANSFER_OUT: { label: 'Transfer OUT', color: 'bg-purple-100 text-purple-700' },
    ADJUSTMENT_IN: { label: 'Ajuste +', color: 'bg-amber-100 text-amber-700' },
    ADJUSTMENT_OUT: { label: 'Ajuste -', color: 'bg-amber-100 text-amber-700' },
    INVENTORY_CORRECTION: { label: 'Corrección Inv.', color: 'bg-slate-100 text-slate-700' },
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Valor Total Stock</p>
                <p className="text-2xl font-bold">{totalValue.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</p>
              </div>
              <Euro className="w-8 h-8 text-emerald-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Productos en Stock</p>
                <p className="text-2xl font-bold">{stockData.length}</p>
              </div>
              <Package className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Stock Bajo</p>
                <p className="text-2xl font-bold text-amber-600">{lowStockCount}</p>
              </div>
              <TrendingDown className="w-8 h-8 text-amber-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Stock Negativo</p>
                <p className="text-2xl font-bold text-red-600">{negativeCount}</p>
              </div>
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="stock" className="gap-2">
            <Warehouse className="w-4 h-4" />
            Stock Actual
          </TabsTrigger>
          <TabsTrigger value="movements" className="gap-2">
            <History className="w-4 h-4" />
            Movimientos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Buscar por nombre o SKU..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>
                        {cat === 'all' ? 'Todas las categorías' : cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Stock Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Coste Medio</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Cobertura</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingStock ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-10">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                        </TableCell>
                      </TableRow>
                    ) : filteredStock.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-10 text-slate-500">
                          No hay stock para mostrar
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredStock.map(item => (
                        <TableRow key={item.id} className={item.is_negative ? 'bg-red-50' : ''}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {item.is_negative && <XCircle className="w-4 h-4 text-red-500" />}
                              {!item.is_negative && item.needs_reorder && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                              {item.product_name}
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-500">{item.product_sku}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{item.product_category}</Badge>
                          </TableCell>
                          <TableCell className={`text-right font-medium ${item.is_negative ? 'text-red-600' : ''}`}>
                            {item.quantity_base?.toFixed(2)} {item.base_unit_code}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.avg_cost?.toFixed(2)}€
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {item.total_value?.toFixed(2)}€
                          </TableCell>
                          <TableCell>
                            {item.days_of_stock != null ? (
                              <Badge className={
                                item.days_of_stock < 3 ? 'bg-red-100 text-red-700' :
                                item.days_of_stock < 7 ? 'bg-amber-100 text-amber-700' :
                                'bg-emerald-100 text-emerald-700'
                              }>
                                {item.days_of_stock.toFixed(0)} días
                              </Badge>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {['encargado', 'manager', 'admin'].includes(user?.role) && (
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => openAdjustDialog(item)}
                              >
                                Ajustar
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nº Movimiento</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Coste Unit.</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Referencia</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingMovements ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-10">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                        </TableCell>
                      </TableRow>
                    ) : movements.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-10 text-slate-500">
                          No hay movimientos para mostrar
                        </TableCell>
                      </TableRow>
                    ) : (
                      movements.map(mov => {
                        const typeInfo = movementTypeLabels[mov.movement_type] || { label: mov.movement_type, color: 'bg-slate-100 text-slate-700' };
                        return (
                          <TableRow key={mov.id}>
                            <TableCell className="font-medium text-slate-600">{mov.movement_number}</TableCell>
                            <TableCell>{mov.movement_date ? format(new Date(mov.movement_date), 'dd/MM/yyyy') : '-'}</TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{mov.product_name}</p>
                                <p className="text-xs text-slate-500">{mov.product_sku}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={typeInfo.color}>{typeInfo.label}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {mov.quantity_base?.toFixed(2)} {mov.unit_code}
                            </TableCell>
                            <TableCell className="text-right">{mov.unit_cost?.toFixed(2)}€</TableCell>
                            <TableCell className="text-right font-medium">{mov.total_cost?.toFixed(2)}€</TableCell>
                            <TableCell className="text-slate-500">{mov.reference_number}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Adjustment Dialog */}
      <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajuste Manual de Stock</DialogTitle>
            <DialogDescription>
              Ajusta el stock de {selectedProduct?.product_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-slate-50 p-4 rounded-lg">
              <p className="text-sm text-slate-500">Stock actual</p>
              <p className="text-2xl font-bold">
                {selectedProduct?.quantity_base?.toFixed(2)} {selectedProduct?.base_unit_code}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Cantidad a ajustar</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="Ej: -5 para restar o 10 para sumar"
                value={adjustmentData.quantity}
                onChange={(e) => setAdjustmentData({ ...adjustmentData, quantity: e.target.value })}
              />
              <p className="text-xs text-slate-500">
                Usa números negativos para reducir stock
              </p>
            </div>
            <div className="space-y-2">
              <Label>Motivo del ajuste *</Label>
              <Textarea
                placeholder="Describe el motivo del ajuste (obligatorio para auditoría)"
                value={adjustmentData.notes}
                onChange={(e) => setAdjustmentData({ ...adjustmentData, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjustDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleAdjust}
              disabled={adjustmentMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {adjustmentMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Confirmar Ajuste'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}