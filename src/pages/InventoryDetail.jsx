import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { marginbites } from '@/api/marginbitesClient';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import {
  ArrowLeft, ClipboardList, CheckCircle2, AlertTriangle,
  Loader2, Save, Send, Package
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';

export default function InventoryDetail({ user }) {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const inventoryId = urlParams.get('id');
  const [counts, setCounts] = useState({});

  const { data: inventory, isLoading } = useQuery({
    queryKey: ['inventory', inventoryId],
    queryFn: async () => {
      const data = await marginbites.entities.Inventory.filter({ id: inventoryId });
      return data[0];
    },
    enabled: !!inventoryId
  });

  const { data: lines = [], isLoading: loadingLines } = useQuery({
    queryKey: ['inventoryLines', inventoryId],
    queryFn: () => marginbites.entities.InventoryLine.filter({ inventory_id: inventoryId }),
    enabled: !!inventoryId
  });

  const saveCountMutation = useMutation({
    mutationFn: async ({ lineId, qtyCountedBase }) => {
      const line = lines.find(l => l.id === lineId);
      const variance = qtyCountedBase - (line?.qty_theoretical_base || 0);
      const variancePct = line?.qty_theoretical_base ? variance / line.qty_theoretical_base : 0;
      const varianceValue = variance * (line?.avg_cost_snapshot || 0);
      const isFlagged = Math.abs(variancePct) > 0.15;

      await marginbites.entities.InventoryLine.update(lineId, {
        qty_counted_base: qtyCountedBase,
        variance_qty_base: variance,
        variance_pct: variancePct,
        variance_value_eur: varianceValue,
        is_flagged: isFlagged,
        flag_reason: isFlagged ? `Variación ${(variancePct * 100).toFixed(0)}%` : null,
        line_status: 'Counted',
        counted_by_user_id: user?.id,
        counted_by_name: user?.full_name,
        counted_at: new Date().toISOString()
      });

      // Actualizar contadores del inventario
      const updatedLines = await marginbites.entities.InventoryLine.filter({ inventory_id: inventoryId });
      const countedLines = updatedLines.filter(l => l.line_status === 'Counted').length;
      const flaggedLines = updatedLines.filter(l => l.is_flagged).length;
      const totalVariance = updatedLines.reduce((sum, l) => sum + (l.variance_value_eur || 0), 0);

      await marginbites.entities.Inventory.update(inventoryId, {
        lines_counted: countedLines,
        lines_flagged: flaggedLines,
        total_variance_value: totalVariance
      });
    },
    onSuccess: () => {
      toast.success('Conteo guardado');
      queryClient.invalidateQueries({ queryKey: ['inventoryLines', inventoryId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', inventoryId] });
    },
    onError: () => {
      toast.error('Error al guardar');
    }
  });

  const submitInventoryMutation = useMutation({
    mutationFn: async () => {
      await marginbites.entities.Inventory.update(inventoryId, {
        status: 'Submitted',
        completed_at: new Date().toISOString()
      });
    },
    onSuccess: () => {
      toast.success('Inventario enviado para revisión');
      queryClient.invalidateQueries({ queryKey: ['inventory', inventoryId] });
    }
  });

  const postCorrectionsMutation = useMutation({
    mutationFn: async () => {
      const movCount = await marginbites.entities.LedgerMovement.list('-created', 1);
      let movNum = movCount.length > 0 ? parseInt(movCount[0].movement_number?.split('-')[2] || '0') + 1 : 1;

      for (const line of lines) {
        if (line.line_status !== 'Counted' || line.variance_qty_base === 0) continue;

        const movType = line.variance_qty_base > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';

        await marginbites.entities.LedgerMovement.create({
          movement_number: `MOV-${new Date().getFullYear()}-${String(movNum++).padStart(6, '0')}`,
          movement_date: format(new Date(), 'yyyy-MM-dd'),
          location_id: inventory.location_id,
          product_id: line.product_id,
          product_name: line.product_name,
          product_sku: line.product_sku,
          movement_type: 'INVENTORY_CORRECTION',
          quantity: Math.abs(line.variance_qty_base),
          unit_code: line.base_unit_code,
          quantity_base: Math.abs(line.variance_qty_base),
          unit_cost: line.avg_cost_snapshot || 0,
          total_cost: Math.abs(line.variance_value_eur || 0),
          reference_type: 'Inventory',
          reference_id: inventoryId,
          reference_number: inventory.inventory_number
        });

        // Actualizar stock
        const stocks = await marginbites.entities.StockOnHand.filter({
          location_id: inventory.location_id,
          product_id: line.product_id
        });

        if (stocks.length > 0) {
          const stock = stocks[0];
          const newQty = line.qty_counted_base;
          await marginbites.entities.StockOnHand.update(stock.id, {
            quantity_base: newQty,
            total_value: newQty * (stock.avg_cost || 0),
            is_negative: newQty < 0,
            last_movement_at: new Date().toISOString()
          });
        }

        await marginbites.entities.InventoryLine.update(line.id, {
          line_status: 'Posted'
        });
      }

      await marginbites.entities.Inventory.update(inventoryId, {
        status: 'Posted'
      });

      await marginbites.entities.AuditLog.create({
        actor_user_id: user?.id,
        actor_email: user?.email,
        actor_name: user?.full_name,
        action_type: 'post',
        entity_type: 'Inventory',
        entity_id: inventoryId,
        entity_number: inventory.inventory_number,
        description: `Correcciones de inventario contabilizadas: ${inventory.inventory_number}`
      });
    },
    onSuccess: () => {
      toast.success('Correcciones contabilizadas');
      queryClient.invalidateQueries({ queryKey: ['inventory', inventoryId] });
      queryClient.invalidateQueries({ queryKey: ['inventoryLines', inventoryId] });
      queryClient.invalidateQueries({ queryKey: ['stockOnHand'] });
    },
    onError: () => {
      toast.error('Error al contabilizar');
    }
  });

  const handleCountChange = (lineId, value) => {
    setCounts({ ...counts, [lineId]: value });
  };

  const saveCount = (lineId) => {
    const value = counts[lineId];
    if (value === undefined || value === '') return;
    saveCountMutation.mutate({ lineId, qtyCountedBase: parseFloat(value) });
  };

  if (isLoading || !inventory) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const progress = inventory.lines_count > 0 
    ? (inventory.lines_counted / inventory.lines_count) * 100 
    : 0;

  const canCount = ['In_Progress', 'Submitted'].includes(inventory.status);
  const canSubmit = inventory.status === 'In_Progress' && inventory.lines_counted > 0;
  const canPost = ['Submitted', 'Reviewed'].includes(inventory.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to={createPageUrl('Inventories')}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{inventory.inventory_number}</h1>
            <p className="text-slate-500">
              {inventory.inventory_type === 'full' ? 'Inventario Completo' : 
               inventory.inventory_type === 'express' ? 'Inventario Exprés' : 
               'Por Anomalía'}
            </p>
          </div>
          <Badge className={
            inventory.status === 'In_Progress' ? 'bg-blue-100 text-blue-700' :
            inventory.status === 'Posted' ? 'bg-emerald-100 text-emerald-700' :
            'bg-amber-100 text-amber-700'
          }>
            {inventory.status?.replace('_', ' ')}
          </Badge>
        </div>
        <div className="flex gap-2">
          {canSubmit && (
            <Button 
              variant="outline"
              onClick={() => submitInventoryMutation.mutate()}
              disabled={submitInventoryMutation.isPending}
            >
              <Send className="w-4 h-4 mr-2" />
              Enviar para Revisión
            </Button>
          )}
          {canPost && (
            <Button 
              onClick={() => postCorrectionsMutation.mutate()}
              disabled={postCorrectionsMutation.isPending}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            >
              {postCorrectionsMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Package className="w-4 h-4" />
              )}
              Contabilizar Correcciones
            </Button>
          )}
        </div>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-slate-500 mb-1">Progreso</p>
              <div className="flex items-center gap-3">
                <Progress value={progress} className="flex-1 h-3" />
                <span className="text-lg font-bold">{progress.toFixed(0)}%</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {inventory.lines_counted || 0} / {inventory.lines_count || 0} líneas
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1">Líneas con Variación</p>
              <p className={`text-2xl font-bold ${inventory.lines_flagged > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                {inventory.lines_flagged || 0}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1">Variación Total</p>
              <p className={`text-2xl font-bold ${
                inventory.total_variance_value > 0 ? 'text-emerald-600' :
                inventory.total_variance_value < 0 ? 'text-red-600' :
                'text-slate-400'
              }`}>
                {inventory.total_variance_value != null 
                  ? `${inventory.total_variance_value >= 0 ? '+' : ''}${inventory.total_variance_value.toFixed(0)}€`
                  : '0€'
                }
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1">Inicio</p>
              <p className="font-medium">
                {inventory.started_at ? format(new Date(inventory.started_at), 'dd/MM/yyyy HH:mm') : '-'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lines Table */}
      <Card>
        <CardHeader>
          <CardTitle>Líneas de Inventario</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Stock Teórico</TableHead>
                  <TableHead className="text-right">Conteo</TableHead>
                  <TableHead className="text-right">Variación</TableHead>
                  <TableHead className="text-right">Variación €</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingLines ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                    </TableCell>
                  </TableRow>
                ) : lines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-slate-500">
                      No hay líneas de inventario
                    </TableCell>
                  </TableRow>
                ) : (
                  lines.map(line => (
                    <TableRow key={line.id} className={line.is_flagged ? 'bg-amber-50' : ''}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{line.product_name}</p>
                          <p className="text-xs text-slate-500">{line.product_sku}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{line.product_category}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {line.qty_theoretical_base?.toFixed(2)} {line.base_unit_code}
                      </TableCell>
                      <TableCell className="text-right">
                        {canCount && line.line_status !== 'Posted' ? (
                          <Input
                            type="number"
                            step="0.01"
                            className="w-24 text-right"
                            value={counts[line.id] ?? line.qty_counted_base ?? ''}
                            onChange={(e) => handleCountChange(line.id, e.target.value)}
                            onBlur={() => saveCount(line.id)}
                            placeholder="0.00"
                          />
                        ) : (
                          <span className="font-medium">
                            {line.qty_counted_base?.toFixed(2) ?? '-'} {line.base_unit_code}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className={`text-right ${
                        line.variance_qty_base > 0 ? 'text-emerald-600' :
                        line.variance_qty_base < 0 ? 'text-red-600' :
                        'text-slate-400'
                      }`}>
                        {line.variance_qty_base != null 
                          ? `${line.variance_qty_base >= 0 ? '+' : ''}${line.variance_qty_base.toFixed(2)}`
                          : '-'
                        }
                        {line.variance_pct != null && (
                          <span className="text-xs ml-1">
                            ({(line.variance_pct * 100).toFixed(0)}%)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${
                        line.variance_value_eur > 0 ? 'text-emerald-600' :
                        line.variance_value_eur < 0 ? 'text-red-600' :
                        'text-slate-400'
                      }`}>
                        {line.variance_value_eur != null 
                          ? `${line.variance_value_eur >= 0 ? '+' : ''}${line.variance_value_eur.toFixed(0)}€`
                          : '-'
                        }
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {line.is_flagged && (
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                          )}
                          <Badge className={
                            line.line_status === 'Posted' ? 'bg-emerald-100 text-emerald-700' :
                            line.line_status === 'Counted' ? 'bg-blue-100 text-blue-700' :
                            'bg-slate-100 text-slate-700'
                          }>
                            {line.line_status === 'Pending' ? 'Pendiente' :
                             line.line_status === 'Counted' ? 'Contado' :
                             line.line_status === 'Posted' ? 'Contabilizado' :
                             line.line_status}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        {canCount && line.line_status !== 'Posted' && counts[line.id] !== undefined && (
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => saveCount(line.id)}
                            disabled={saveCountMutation.isPending}
                          >
                            <Save className="w-4 h-4" />
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
    </div>
  );
}