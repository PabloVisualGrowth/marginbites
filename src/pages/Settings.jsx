import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  Settings as SettingsIcon, Building2, Users, Package, ChefHat,
  Truck, Save, Loader2, Plus, Pencil, Trash2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

export default function Settings({ selectedLocationId, user }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('general');
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [showSupplierDialog, setShowSupplierDialog] = useState(false);

  const { data: location } = useQuery({
    queryKey: ['location', selectedLocationId],
    queryFn: async () => {
      if (!selectedLocationId) return null;
      const locations = await base44.entities.Location.filter({ id: selectedLocationId });
      return locations[0];
    },
    enabled: !!selectedLocationId
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list('-created_date', 100),
  });

  const [localSettings, setLocalSettings] = useState({
    reorder_days_threshold: 3,
    target_coverage_days: 7,
    ocr_confidence_warning: 0.80,
    inventory_variance_flag_pct: 0.15,
    gap_warning_pct: 0.02,
    gap_critical_pct: 0.05,
    auto_post_inventory: false
  });

  React.useEffect(() => {
    if (location?.settings) {
      setLocalSettings({ ...localSettings, ...location.settings });
    }
  }, [location]);

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.Location.update(selectedLocationId, {
        settings: localSettings
      });
    },
    onSuccess: () => {
      toast.success('Configuración guardada');
      queryClient.invalidateQueries({ queryKey: ['location'] });
    },
    onError: () => {
      toast.error('Error al guardar');
    }
  });

  const [supplierForm, setSupplierForm] = useState({
    supplier_code: '',
    name: '',
    email: '',
    phone: '',
    preferred_order_channel: 'email',
    is_active: true
  });

  const saveSupplierMutation = useMutation({
    mutationFn: async (data) => {
      if (editingSupplier) {
        await base44.entities.Supplier.update(editingSupplier.id, data);
      } else {
        await base44.entities.Supplier.create(data);
      }
    },
    onSuccess: () => {
      toast.success(editingSupplier ? 'Proveedor actualizado' : 'Proveedor creado');
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setShowSupplierDialog(false);
      setEditingSupplier(null);
      setSupplierForm({
        supplier_code: '',
        name: '',
        email: '',
        phone: '',
        preferred_order_channel: 'email',
        is_active: true
      });
    },
    onError: () => {
      toast.error('Error al guardar proveedor');
    }
  });

  const openEditSupplier = (supplier) => {
    setEditingSupplier(supplier);
    setSupplierForm({
      supplier_code: supplier.supplier_code || '',
      name: supplier.name || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      preferred_order_channel: supplier.preferred_order_channel || 'email',
      is_active: supplier.is_active !== false
    });
    setShowSupplierDialog(true);
  };

  const openNewSupplier = () => {
    setEditingSupplier(null);
    setSupplierForm({
      supplier_code: '',
      name: '',
      email: '',
      phone: '',
      preferred_order_channel: 'email',
      is_active: true
    });
    setShowSupplierDialog(true);
  };

  if (user?.role !== 'admin' && user?.role !== 'manager') {
    return (
      <Card>
        <CardContent className="py-20 text-center">
          <SettingsIcon className="w-16 h-16 mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-700 mb-2">Acceso Restringido</h3>
          <p className="text-slate-500">No tienes permisos para acceder a la configuración</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="general" className="gap-2">
            <SettingsIcon className="w-4 h-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="gap-2">
            <Truck className="w-4 h-4" />
            Proveedores
          </TabsTrigger>
          <TabsTrigger value="products" className="gap-2">
            <Package className="w-4 h-4" />
            Productos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          {/* Thresholds */}
          <Card>
            <CardHeader>
              <CardTitle>Umbrales de Pedidos</CardTitle>
              <CardDescription>
                Configura los parámetros para sugerencias automáticas de pedido
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Días mínimos de cobertura para alertar</Label>
                  <Input
                    type="number"
                    value={localSettings.reorder_days_threshold}
                    onChange={(e) => setLocalSettings({
                      ...localSettings,
                      reorder_days_threshold: parseInt(e.target.value)
                    })}
                  />
                  <p className="text-xs text-slate-500">
                    Se sugerirá pedir cuando el stock cubra menos de estos días
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Días objetivo de cobertura</Label>
                  <Input
                    type="number"
                    value={localSettings.target_coverage_days}
                    onChange={(e) => setLocalSettings({
                      ...localSettings,
                      target_coverage_days: parseInt(e.target.value)
                    })}
                  />
                  <p className="text-xs text-slate-500">
                    Cantidad sugerida para cubrir estos días
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* OCR Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Configuración OCR</CardTitle>
              <CardDescription>
                Umbrales de confianza para procesamiento de albaranes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Umbral de advertencia de confianza OCR</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={localSettings.ocr_confidence_warning}
                  onChange={(e) => setLocalSettings({
                    ...localSettings,
                    ocr_confidence_warning: parseFloat(e.target.value)
                  })}
                />
                <p className="text-xs text-slate-500">
                  Se mostrará advertencia si la confianza es menor a este valor (0-1)
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Inventory Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Configuración de Inventarios</CardTitle>
              <CardDescription>
                Parámetros para detección de variaciones
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Umbral de variación para flaggear (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={localSettings.inventory_variance_flag_pct}
                    onChange={(e) => setLocalSettings({
                      ...localSettings,
                      inventory_variance_flag_pct: parseFloat(e.target.value)
                    })}
                  />
                  <p className="text-xs text-slate-500">
                    Se marcarán líneas con variación mayor a este % (ej: 0.15 = 15%)
                  </p>
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div>
                    <Label>Auto-contabilizar correcciones</Label>
                    <p className="text-xs text-slate-500">
                      Postear automáticamente al cerrar inventario
                    </p>
                  </div>
                  <Switch
                    checked={localSettings.auto_post_inventory}
                    onCheckedChange={(v) => setLocalSettings({
                      ...localSettings,
                      auto_post_inventory: v
                    })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Gap Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Umbrales de Food Cost Gap</CardTitle>
              <CardDescription>
                Configura cuándo se genera alerta por gap de food cost
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Umbral de advertencia (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={localSettings.gap_warning_pct}
                    onChange={(e) => setLocalSettings({
                      ...localSettings,
                      gap_warning_pct: parseFloat(e.target.value)
                    })}
                  />
                  <p className="text-xs text-slate-500">
                    Advertencia si gap supera este % (ej: 0.02 = 2%)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Umbral crítico (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={localSettings.gap_critical_pct}
                    onChange={(e) => setLocalSettings({
                      ...localSettings,
                      gap_critical_pct: parseFloat(e.target.value)
                    })}
                  />
                  <p className="text-xs text-slate-500">
                    Alerta crítica si gap supera este % (ej: 0.05 = 5%)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button 
              onClick={() => saveSettingsMutation.mutate()}
              disabled={saveSettingsMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 gap-2"
            >
              {saveSettingsMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Guardar Configuración
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">Proveedores</h3>
            <Button onClick={openNewSupplier} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4" />
              Nuevo Proveedor
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Canal Preferido</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map(supplier => (
                    <TableRow key={supplier.id}>
                      <TableCell className="font-medium">{supplier.supplier_code}</TableCell>
                      <TableCell>{supplier.name}</TableCell>
                      <TableCell>{supplier.email}</TableCell>
                      <TableCell>{supplier.phone}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {supplier.preferred_order_channel === 'email' ? 'Email' : 'WhatsApp'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={supplier.is_active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}>
                          {supplier.is_active !== false ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEditSupplier(supplier)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">Productos ({products.length})</h3>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="max-h-[600px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Unidad Base</TableHead>
                      <TableHead>Precio Medio</TableHead>
                      <TableHead>Key Product</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.slice(0, 50).map(product => (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">{product.sku}</TableCell>
                        <TableCell>{product.product_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{product.category}</Badge>
                        </TableCell>
                        <TableCell>{product.base_unit_code || '-'}</TableCell>
                        <TableCell>{product.avg_price?.toFixed(2)}€</TableCell>
                        <TableCell>
                          {product.is_key_product && (
                            <Badge className="bg-purple-100 text-purple-700">Clave</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={product.is_active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}>
                            {product.is_active !== false ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Supplier Dialog */}
      <Dialog open={showSupplierDialog} onOpenChange={setShowSupplierDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSupplier ? 'Editar Proveedor' : 'Nuevo Proveedor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Código *</Label>
                <Input
                  value={supplierForm.supplier_code}
                  onChange={(e) => setSupplierForm({ ...supplierForm, supplier_code: e.target.value })}
                  placeholder="PROV001"
                />
              </div>
              <div className="space-y-2">
                <Label>Nombre *</Label>
                <Input
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  placeholder="Nombre del proveedor"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={supplierForm.email}
                  onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                  placeholder="email@proveedor.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input
                  value={supplierForm.phone}
                  onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                  placeholder="+34 600 000 000"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Canal preferido de pedido</Label>
              <Select 
                value={supplierForm.preferred_order_channel}
                onValueChange={(v) => setSupplierForm({ ...supplierForm, preferred_order_channel: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>Activo</Label>
              <Switch
                checked={supplierForm.is_active}
                onCheckedChange={(v) => setSupplierForm({ ...supplierForm, is_active: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSupplierDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => saveSupplierMutation.mutate(supplierForm)}
              disabled={saveSupplierMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saveSupplierMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Guardar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}