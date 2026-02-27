import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import {
  ArrowLeft, Plus, Trash2, Loader2, Save
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { toast } from 'sonner';

export default function PONew({ selectedLocationId }) {
  const [supplierId, setSupplierId] = useState('');
  const [orderDate, setOrderDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([]);

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.filter({ is_active: true }),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }),
  });

  const selectedSupplier = suppliers.find(s => s.id === supplierId);
  const supplierProducts = products.filter(p => p.default_supplier_id === supplierId);

  const createPOMutation = useMutation({
    mutationFn: async () => {
      const poCount = await base44.entities.PurchaseOrder.list('-created_date', 1);
      const poNum = poCount.length > 0 ? parseInt(poCount[0].po_number?.split('-')[2] || '0') + 1 : 1;

      const totalAmount = lines.reduce((sum, l) => sum + (l.ordered_qty * l.unit_price), 0);

      const po = await base44.entities.PurchaseOrder.create({
        po_number: `PO-${new Date().getFullYear()}-${String(poNum).padStart(4, '0')}`,
        location_id: selectedLocationId,
        supplier_id: supplierId,
        supplier_name: selectedSupplier?.name,
        order_date: orderDate,
        requested_delivery_date: deliveryDate || null,
        status: 'Draft',
        source: 'manual',
        notes,
        total_estimated_amount: totalAmount,
        lines_count: lines.length
      });

      for (const line of lines) {
        await base44.entities.POLine.create({
          purchase_order_id: po.id,
          po_number: po.po_number,
          product_id: line.product_id,
          product_name: line.product_name,
          product_sku: line.product_sku,
          unit_code: line.unit_code,
          ordered_qty: line.ordered_qty,
          unit_price_estimated: line.unit_price,
          line_total_estimated: line.ordered_qty * line.unit_price,
          line_status: 'Open'
        });
      }

      return po;
    },
    onSuccess: (po) => {
      toast.success(`Pedido ${po.po_number} creado`);
      window.location.href = createPageUrl('PODetail') + `?id=${po.id}`;
    },
    onError: () => {
      toast.error('Error al crear el pedido');
    }
  });

  const addLine = (product) => {
    if (lines.some(l => l.product_id === product.id)) {
      toast.error('Este producto ya está en el pedido');
      return;
    }
    setLines([...lines, {
      product_id: product.id,
      product_name: product.product_name,
      product_sku: product.sku,
      unit_code: product.purchase_unit_code || product.base_unit_code,
      ordered_qty: 1,
      unit_price: product.avg_price || 0
    }]);
  };

  const updateLine = (index, field, value) => {
    const newLines = [...lines];
    newLines[index][field] = value;
    setLines(newLines);
  };

  const removeLine = (index) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  const totalAmount = lines.reduce((sum, l) => sum + (l.ordered_qty * l.unit_price), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to={createPageUrl('PurchaseOrders')}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Nuevo Pedido</h1>
          <p className="text-slate-500">Crea un pedido manual a proveedor</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Datos del Pedido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Proveedor *</Label>
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona proveedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Fecha Pedido</Label>
                  <Input
                    type="date"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fecha Entrega Solicitada</Label>
                  <Input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notas</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notas adicionales..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Lines */}
          <Card>
            <CardHeader>
              <CardTitle>Líneas del Pedido</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="w-24">Cantidad</TableHead>
                    <TableHead className="w-24">Unidad</TableHead>
                    <TableHead className="w-28">Precio Unit.</TableHead>
                    <TableHead className="w-28 text-right">Total</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                        Añade productos del proveedor seleccionado
                      </TableCell>
                    </TableRow>
                  ) : (
                    lines.map((line, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{line.product_name}</p>
                            <p className="text-xs text-slate-500">{line.product_sku}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            value={line.ordered_qty}
                            onChange={(e) => updateLine(index, 'ordered_qty', parseFloat(e.target.value) || 0)}
                            className="w-20"
                          />
                        </TableCell>
                        <TableCell>{line.unit_code}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.unit_price}
                            onChange={(e) => updateLine(index, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="w-24"
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {(line.ordered_qty * line.unit_price).toFixed(2)}€
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => removeLine(index)}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {lines.length > 0 && (
                <div className="p-4 border-t flex justify-end">
                  <div className="text-right">
                    <p className="text-sm text-slate-500">Total Estimado</p>
                    <p className="text-2xl font-bold">{totalAmount.toFixed(2)}€</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Product Selector */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Productos del Proveedor</CardTitle>
            </CardHeader>
            <CardContent>
              {!supplierId ? (
                <p className="text-slate-500 text-sm text-center py-4">
                  Selecciona un proveedor para ver sus productos
                </p>
              ) : supplierProducts.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-4">
                  Este proveedor no tiene productos asociados
                </p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {supplierProducts.map(product => (
                    <div 
                      key={product.id}
                      className="flex items-center justify-between p-2 bg-slate-50 rounded hover:bg-slate-100 cursor-pointer"
                      onClick={() => addLine(product)}
                    >
                      <div>
                        <p className="text-sm font-medium">{product.product_name}</p>
                        <p className="text-xs text-slate-500">{product.avg_price?.toFixed(2)}€/{product.base_unit_code}</p>
                      </div>
                      <Plus className="w-4 h-4 text-emerald-600" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="mt-4">
            <Button 
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              onClick={() => createPOMutation.mutate()}
              disabled={!supplierId || lines.length === 0 || createPOMutation.isPending}
            >
              {createPOMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Crear Pedido
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}