import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { marginbites } from '@/api/marginbitesClient';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import {
  Plus, Search, ClipboardList, Play, CheckCircle2, Clock,
  AlertTriangle, Loader2, Eye, XCircle, Sparkles, BarChart3
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
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
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

const statusConfig = {
  Draft: { label: 'Borrador', color: 'bg-slate-100 text-slate-700', icon: ClipboardList },
  In_Progress: { label: 'En Progreso', color: 'bg-blue-100 text-blue-700', icon: Play },
  Submitted: { label: 'Enviado', color: 'bg-purple-100 text-purple-700', icon: Clock },
  Reviewed: { label: 'Revisado', color: 'bg-amber-100 text-amber-700', icon: Eye },
  Posted: { label: 'Contabilizado', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  Closed: { label: 'Cerrado', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  Cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-700', icon: XCircle },
};

const typeLabels = {
  full: 'Completo',
  express: 'Exprés',
  anomaly_triggered: 'Por Anomalía'
};

export default function Inventories({ selectedLocationId, user }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newInventoryData, setNewInventoryData] = useState({
    inventory_type: 'full',
    count_scope: 'all_products',
    auto_post_corrections: false
  });

  const { data: inventories = [], isLoading } = useQuery({
    queryKey: ['inventories', selectedLocationId, statusFilter],
    queryFn: async () => {
      if (!selectedLocationId) return [];
      const filters = { location_id: selectedLocationId };
      if (statusFilter !== 'all') filters.status = statusFilter;
      return marginbites.entities.Inventory.filter(filters, { sort: '-started_at', perPage: 50 });
    },
    enabled: !!selectedLocationId
  });

  const { data: anomalies = [] } = useQuery({
    queryKey: ['stockAnomalies', selectedLocationId],
    queryFn: async () => {
      if (!selectedLocationId) return [];
      const stock = await marginbites.entities.StockOnHand.filter({ location_id: selectedLocationId });
      return stock.filter(s => s.is_negative || s.quantity_base < 0);
    },
    enabled: !!selectedLocationId
  });

  const createInventoryMutation = useMutation({
    mutationFn: async (data) => {
      const invCount = await marginbites.entities.Inventory.list('-created', 1);
      const invNum = invCount.length > 0 ? parseInt(invCount[0].inventory_number?.split('-')[2] || '0') + 1 : 1;

      const inventory = await marginbites.entities.Inventory.create({
        inventory_number: `INV-${new Date().getFullYear()}-${String(invNum).padStart(4, '0')}`,
        location_id: selectedLocationId,
        inventory_type: data.inventory_type,
        count_scope: data.count_scope,
        auto_post_corrections: data.auto_post_corrections,
        status: 'In_Progress',
        started_at: new Date().toISOString(),
        lines_count: 0,
        lines_counted: 0,
        lines_flagged: 0
      });

      // Crear líneas de inventario
      let products = [];
      if (data.count_scope === 'all_products') {
        products = await marginbites.entities.Product.filter({ is_active: true });
      } else if (data.count_scope === 'key_products') {
        products = await marginbites.entities.Product.filter({ is_active: true, is_key_product: true });
      }

      const stock = await marginbites.entities.StockOnHand.filter({ location_id: selectedLocationId });
      const stockMap = {};
      stock.forEach(s => { stockMap[s.product_id] = s; });

      for (const product of products) {
        const stockItem = stockMap[product.id];
        await marginbites.entities.InventoryLine.create({
          inventory_id: inventory.id,
          inventory_number: inventory.inventory_number,
          product_id: product.id,
          product_name: product.product_name,
          product_sku: product.sku,
          product_category: product.category,
          qty_theoretical_base: stockItem?.quantity_base || 0,
          base_unit_code: product.base_unit_code || 'kg',
          avg_cost_snapshot: stockItem?.avg_cost || product.avg_price || 0,
          line_status: 'Pending'
        });
      }

      await marginbites.entities.Inventory.update(inventory.id, {
        lines_count: products.length
      });

      return inventory;
    },
    onSuccess: (inventory) => {
      toast.success(`Inventario ${inventory.inventory_number} creado`);
      queryClient.invalidateQueries({ queryKey: ['inventories'] });
      setShowNewDialog(false);
    },
    onError: () => {
      toast.error('Error al crear el inventario');
    }
  });

  const createExpressFromAnomaliesMutation = useMutation({
    mutationFn: async () => {
      const invCount = await marginbites.entities.Inventory.list('-created', 1);
      const invNum = invCount.length > 0 ? parseInt(invCount[0].inventory_number?.split('-')[2] || '0') + 1 : 1;

      const inventory = await marginbites.entities.Inventory.create({
        inventory_number: `INV-${new Date().getFullYear()}-${String(invNum).padStart(4, '0')}`,
        location_id: selectedLocationId,
        inventory_type: 'anomaly_triggered',
        count_scope: 'custom_list',
        auto_post_corrections: false,
        status: 'In_Progress',
        started_at: new Date().toISOString(),
        anomaly_reasons: anomalies.map(a => `Stock negativo: ${a.product_name}`),
        lines_count: anomalies.length,
        lines_counted: 0,
        lines_flagged: 0
      });

      for (const item of anomalies) {
        await marginbites.entities.InventoryLine.create({
          inventory_id: inventory.id,
          inventory_number: inventory.inventory_number,
          product_id: item.product_id,
          product_name: item.product_name,
          product_sku: item.product_sku,
          product_category: item.product_category,
          qty_theoretical_base: item.quantity_base || 0,
          base_unit_code: item.base_unit_code || 'kg',
          avg_cost_snapshot: item.avg_cost || 0,
          line_status: 'Pending',
          is_flagged: true,
          flag_reason: 'Stock negativo detectado'
        });
      }

      return inventory;
    },
    onSuccess: (inventory) => {
      toast.success(`Inventario exprés ${inventory.inventory_number} creado con ${anomalies.length} productos`);
      queryClient.invalidateQueries({ queryKey: ['inventories'] });
    },
    onError: () => {
      toast.error('Error al crear el inventario exprés');
    }
  });

  const filteredInventories = inventories.filter(inv => {
    if (!searchTerm) return true;
    return inv.inventory_number?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const inProgressCount = inventories.filter(i => i.status === 'In_Progress').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-slate-500">
            Gestiona inventarios completos y exprés para control de stock
          </p>
        </div>
        <div className="flex gap-2">
          {anomalies.length > 0 && (
            <Button 
              variant="outline"
              onClick={() => createExpressFromAnomaliesMutation.mutate()}
              disabled={createExpressFromAnomaliesMutation.isPending}
              className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
            >
              <AlertTriangle className="w-4 h-4" />
              Inventario Exprés ({anomalies.length})
            </Button>
          )}
          <Button 
            onClick={() => setShowNewDialog(true)}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4" />
            Nuevo Inventario
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">En Progreso</p>
                <p className="text-2xl font-bold text-blue-600">{inProgressCount}</p>
              </div>
              <Play className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Anomalías Detectadas</p>
                <p className="text-2xl font-bold text-red-600">{anomalies.length}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total del Mes</p>
                <p className="text-2xl font-bold">{inventories.length}</p>
              </div>
              <ClipboardList className="w-8 h-8 text-slate-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Cerrados</p>
                <p className="text-2xl font-bold text-emerald-600">
                  {inventories.filter(i => ['Posted', 'Closed'].includes(i.status)).length}
                </p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por número..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="In_Progress">En Progreso</SelectItem>
                <SelectItem value="Submitted">Enviado</SelectItem>
                <SelectItem value="Reviewed">Revisado</SelectItem>
                <SelectItem value="Posted">Contabilizado</SelectItem>
                <SelectItem value="Closed">Cerrado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Inventories Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Inventario</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Progreso</TableHead>
                  <TableHead>Inicio</TableHead>
                  <TableHead>Líneas Flaggeadas</TableHead>
                  <TableHead>Variación Total</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                    </TableCell>
                  </TableRow>
                ) : filteredInventories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-slate-500">
                      No hay inventarios para mostrar
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInventories.map(inv => {
                    const status = statusConfig[inv.status] || statusConfig.Draft;
                    const StatusIcon = status.icon;
                    const progress = inv.lines_count > 0 
                      ? (inv.lines_counted / inv.lines_count) * 100 
                      : 0;
                    return (
                      <TableRow key={inv.id} className="hover:bg-slate-50">
                        <TableCell className="font-medium">
                          <Link 
                            to={createPageUrl('InventoryDetail') + `?id=${inv.id}`}
                            className="text-emerald-600 hover:underline"
                          >
                            {inv.inventory_number}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {typeLabels[inv.inventory_type] || inv.inventory_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${status.color} gap-1`}>
                            <StatusIcon className="w-3 h-3" />
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="w-32">
                            <div className="flex justify-between text-xs text-slate-500 mb-1">
                              <span>{inv.lines_counted || 0}/{inv.lines_count || 0}</span>
                              <span>{progress.toFixed(0)}%</span>
                            </div>
                            <Progress value={progress} className="h-2" />
                          </div>
                        </TableCell>
                        <TableCell>
                          {inv.started_at ? format(new Date(inv.started_at), 'dd/MM/yyyy HH:mm') : '-'}
                        </TableCell>
                        <TableCell>
                          {inv.lines_flagged > 0 ? (
                            <Badge className="bg-red-100 text-red-700">
                              {inv.lines_flagged}
                            </Badge>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </TableCell>
                        <TableCell className={
                          inv.total_variance_value > 0 ? 'text-emerald-600 font-medium' :
                          inv.total_variance_value < 0 ? 'text-red-600 font-medium' :
                          'text-slate-400'
                        }>
                          {inv.total_variance_value != null 
                            ? `${inv.total_variance_value >= 0 ? '+' : ''}${inv.total_variance_value.toFixed(0)}€`
                            : '-'
                          }
                        </TableCell>
                        <TableCell className="text-right">
                          <Link to={createPageUrl('InventoryDetail') + `?id=${inv.id}`}>
                            <Button variant="ghost" size="icon">
                              <Eye className="w-4 h-4" />
                            </Button>
                          </Link>
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

      {/* New Inventory Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Inventario</DialogTitle>
            <DialogDescription>
              Configura y comienza un nuevo inventario de stock
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Tipo de Inventario</Label>
              <Select 
                value={newInventoryData.inventory_type} 
                onValueChange={(v) => setNewInventoryData({ ...newInventoryData, inventory_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Completo</SelectItem>
                  <SelectItem value="express">Exprés</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Alcance</Label>
              <Select 
                value={newInventoryData.count_scope} 
                onValueChange={(v) => setNewInventoryData({ ...newInventoryData, count_scope: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_products">Todos los productos</SelectItem>
                  <SelectItem value="key_products">Solo productos clave</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Auto-contabilizar correcciones</Label>
                <p className="text-xs text-slate-500">
                  Postear automáticamente las correcciones al ledger
                </p>
              </div>
              <Switch
                checked={newInventoryData.auto_post_corrections}
                onCheckedChange={(v) => setNewInventoryData({ ...newInventoryData, auto_post_corrections: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => createInventoryMutation.mutate(newInventoryData)}
              disabled={createInventoryMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {createInventoryMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Crear Inventario'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}