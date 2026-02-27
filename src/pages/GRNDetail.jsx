import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { marginbites } from '@/api/marginbitesClient';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import {
  ArrowLeft, Package, CheckCircle2, XCircle, AlertTriangle,
  FileText, Loader2, Save, Eye, Edit2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

const statusConfig = {
  Draft: { label: 'Borrador', color: 'bg-slate-100 text-slate-700' },
  OCR_Processing: { label: 'Procesando OCR', color: 'bg-blue-100 text-blue-700' },
  Pending_Validation: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700' },
  Validated: { label: 'Validado', color: 'bg-emerald-100 text-emerald-700' },
  Posted: { label: 'Contabilizado', color: 'bg-green-100 text-green-700' },
  Rejected: { label: 'Rechazado', color: 'bg-red-100 text-red-700' },
};

export default function GRNDetail({ user }) {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const grnId = urlParams.get('id');
  const [validationNotes, setValidationNotes] = useState('');
  const [showIncidentDialog, setShowIncidentDialog] = useState(false);
  const [incidentData, setIncidentData] = useState({
    incident_type: 'price_mismatch',
    severity: 'medium',
    description: '',
    impact_eur: 0
  });

  const { data: grn, isLoading } = useQuery({
    queryKey: ['grn', grnId],
    queryFn: async () => {
      const data = await marginbites.entities.GRN.filter({ id: grnId });
      return data[0];
    },
    enabled: !!grnId
  });

  const { data: lines = [] } = useQuery({
    queryKey: ['grnLines', grnId],
    queryFn: () => marginbites.entities.GRNLine.filter({ grn_id: grnId }),
    enabled: !!grnId
  });

  const { data: incidents = [] } = useQuery({
    queryKey: ['grnIncidents', grnId],
    queryFn: () => marginbites.entities.GRNIncident.filter({ grn_id: grnId }),
    enabled: !!grnId
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => marginbites.entities.Product.filter({ is_active: true }),
  });

  const validateMutation = useMutation({
    mutationFn: async () => {
      await marginbites.entities.GRN.update(grnId, {
        status: 'Validated',
        validation_notes: validationNotes,
        validated_by_user_id: user?.id,
        validated_by_name: user?.full_name,
        validated_at: new Date().toISOString()
      });

      await marginbites.entities.AuditLog.create({
        actor_user_id: user?.id,
        actor_email: user?.email,
        actor_name: user?.full_name,
        action_type: 'validate',
        entity_type: 'GRN',
        entity_id: grnId,
        entity_number: grn?.grn_number,
        description: `GRN validada: ${grn?.grn_number}`
      });
    },
    onSuccess: () => {
      toast.success('Recepción validada');
      queryClient.invalidateQueries({ queryKey: ['grn', grnId] });
    },
    onError: () => {
      toast.error('Error al validar');
    }
  });

  const postMutation = useMutation({
    mutationFn: async () => {
      // Crear movimientos de ledger
      const movCount = await marginbites.entities.LedgerMovement.list('-created_date', 1);
      let movNum = movCount.length > 0 ? parseInt(movCount[0].movement_number?.split('-')[2] || '0') + 1 : 1;

      for (const line of lines) {
        if (!line.product_id) continue;

        await marginbites.entities.LedgerMovement.create({
          movement_number: `MOV-${new Date().getFullYear()}-${String(movNum++).padStart(6, '0')}`,
          movement_date: grn.delivery_date || format(new Date(), 'yyyy-MM-dd'),
          location_id: grn.location_id,
          location_name: grn.location_name,
          product_id: line.product_id,
          product_name: line.product_name,
          product_sku: line.product_sku,
          movement_type: 'GRN_IN',
          quantity: line.quantity,
          unit_code: line.unit_code,
          quantity_base: line.quantity_base || line.quantity,
          unit_cost: line.unit_price,
          total_cost: line.line_total,
          reference_type: 'GRN',
          reference_id: grnId,
          reference_number: grn.grn_number
        });

        // Actualizar stock
        const existingStock = await marginbites.entities.StockOnHand.filter({
          location_id: grn.location_id,
          product_id: line.product_id
        });

        if (existingStock.length > 0) {
          const stock = existingStock[0];
          const oldQty = stock.quantity_base || 0;
          const inQty = line.quantity_base || line.quantity;
          const newQty = oldQty + inQty;
          
          // Weighted average
          const oldAvgCost = stock.avg_cost || 0;
          const inCost = line.unit_price || 0;
          const newAvgCost = newQty > 0 
            ? ((oldQty * oldAvgCost) + (inQty * inCost)) / newQty 
            : inCost;

          await marginbites.entities.StockOnHand.update(stock.id, {
            quantity_base: newQty,
            avg_cost: newAvgCost,
            total_value: newQty * newAvgCost,
            is_negative: newQty < 0,
            last_movement_at: new Date().toISOString()
          });
        } else {
          const product = products.find(p => p.id === line.product_id);
          await marginbites.entities.StockOnHand.create({
            location_id: grn.location_id,
            location_name: grn.location_name,
            product_id: line.product_id,
            product_name: line.product_name,
            product_sku: line.product_sku,
            product_category: product?.category,
            quantity_base: line.quantity_base || line.quantity,
            base_unit_code: line.unit_code,
            avg_cost: line.unit_price,
            total_value: line.line_total,
            is_negative: false,
            last_movement_at: new Date().toISOString()
          });
        }
      }

      await marginbites.entities.GRN.update(grnId, {
        status: 'Posted',
        posted_at: new Date().toISOString()
      });

      await marginbites.entities.AuditLog.create({
        actor_user_id: user?.id,
        actor_email: user?.email,
        actor_name: user?.full_name,
        action_type: 'post',
        entity_type: 'GRN',
        entity_id: grnId,
        entity_number: grn?.grn_number,
        description: `GRN contabilizada: ${grn?.grn_number} - ${lines.length} líneas`
      });
    },
    onSuccess: () => {
      toast.success('Recepción contabilizada en el stock');
      queryClient.invalidateQueries({ queryKey: ['grn', grnId] });
      queryClient.invalidateQueries({ queryKey: ['stockOnHand'] });
    },
    onError: (err) => {
      console.error(err);
      toast.error('Error al contabilizar');
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      await marginbites.entities.GRN.update(grnId, {
        status: 'Rejected',
        validation_notes: validationNotes
      });
    },
    onSuccess: () => {
      toast.success('Recepción rechazada');
      queryClient.invalidateQueries({ queryKey: ['grn', grnId] });
    }
  });

  const createIncidentMutation = useMutation({
    mutationFn: async (data) => {
      await marginbites.entities.GRNIncident.create({
        ...data,
        grn_id: grnId,
        grn_number: grn?.grn_number
      });
    },
    onSuccess: () => {
      toast.success('Incidencia registrada');
      queryClient.invalidateQueries({ queryKey: ['grnIncidents', grnId] });
      setShowIncidentDialog(false);
      setIncidentData({
        incident_type: 'price_mismatch',
        severity: 'medium',
        description: '',
        impact_eur: 0
      });
    }
  });

  if (isLoading || !grn) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const status = statusConfig[grn.status] || statusConfig.Draft;
  const canValidate = ['Pending_Validation'].includes(grn.status);
  const canPost = grn.status === 'Validated';
  const canReject = ['Pending_Validation', 'Validated'].includes(grn.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to={createPageUrl('GRNList')}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{grn.grn_number}</h1>
            <p className="text-slate-500">{grn.supplier_name}</p>
          </div>
          <Badge className={status.color}>{status.label}</Badge>
          {grn.ocr_confidence < 0.8 && grn.ocr_processed && (
            <Badge className="bg-red-100 text-red-700 gap-1">
              <AlertTriangle className="w-3 h-3" />
              OCR {(grn.ocr_confidence * 100).toFixed(0)}%
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {canValidate && (
            <Button 
              onClick={() => validateMutation.mutate()}
              disabled={validateMutation.isPending}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            >
              {validateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Validar
            </Button>
          )}
          {canPost && (
            <Button 
              onClick={() => postMutation.mutate()}
              disabled={postMutation.isPending}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
            >
              {postMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
              Contabilizar
            </Button>
          )}
          {canReject && (
            <Button 
              variant="destructive"
              onClick={() => rejectMutation.mutate()}
              disabled={rejectMutation.isPending}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Rechazar
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Información General</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-slate-500">Nº Albarán</p>
                  <p className="font-medium">{grn.albaran_number || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Fecha Entrega</p>
                  <p className="font-medium">
                    {grn.delivery_date ? format(new Date(grn.delivery_date), 'dd/MM/yyyy') : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Total</p>
                  <p className="font-medium text-lg">{grn.total_amount?.toFixed(2)}€</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Líneas</p>
                  <p className="font-medium">{lines.length}</p>
                </div>
              </div>
              {grn.albaran_file_url && (
                <div className="mt-4">
                  <a 
                    href={grn.albaran_file_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-emerald-600 hover:underline"
                  >
                    <FileText className="w-4 h-4" />
                    Ver documento original
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Lines */}
          <Card>
            <CardHeader>
              <CardTitle>Líneas de Recepción</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Descripción OCR</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Precio Unit.</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Flags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map(line => (
                    <TableRow key={line.id} className={line.is_flagged ? 'bg-amber-50' : ''}>
                      <TableCell>
                        {line.product_name ? (
                          <div>
                            <p className="font-medium">{line.product_name}</p>
                            <p className="text-xs text-slate-500">{line.product_sku}</p>
                          </div>
                        ) : (
                          <Badge className="bg-red-100 text-red-700">Sin mapear</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-500">{line.raw_description}</TableCell>
                      <TableCell className="text-right">
                        {line.quantity} {line.unit_code}
                      </TableCell>
                      <TableCell className="text-right">{line.unit_price?.toFixed(2)}€</TableCell>
                      <TableCell className="text-right font-medium">{line.line_total?.toFixed(2)}€</TableCell>
                      <TableCell>
                        {line.is_flagged && (
                          <Badge className="bg-amber-100 text-amber-700">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            {line.flag_reason || 'Revisar'}
                          </Badge>
                        )}
                        {line.variance_price_vs_product_avg && Math.abs(line.variance_price_vs_product_avg) > 0.5 && (
                          <Badge className="bg-blue-100 text-blue-700 ml-1">
                            {line.variance_price_vs_product_avg > 0 ? '+' : ''}{line.variance_price_vs_product_avg.toFixed(2)}€
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Validation */}
          {(canValidate || canPost) && (
            <Card>
              <CardHeader>
                <CardTitle>Validación</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Notas de validación</Label>
                  <Textarea
                    value={validationNotes}
                    onChange={(e) => setValidationNotes(e.target.value)}
                    placeholder="Observaciones..."
                    className="mt-2"
                  />
                </div>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => setShowIncidentDialog(true)}
                >
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Registrar Incidencia
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Incidents */}
          {incidents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-red-600">Incidencias ({incidents.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {incidents.map(inc => (
                  <div key={inc.id} className="p-3 bg-red-50 rounded-lg border border-red-200">
                    <div className="flex items-start justify-between">
                      <Badge className={
                        inc.severity === 'high' ? 'bg-red-100 text-red-700' :
                        inc.severity === 'medium' ? 'bg-amber-100 text-amber-700' :
                        'bg-blue-100 text-blue-700'
                      }>
                        {inc.incident_type?.replace('_', ' ')}
                      </Badge>
                      <span className="text-sm font-medium">{inc.impact_eur?.toFixed(0)}€</span>
                    </div>
                    <p className="text-sm text-slate-600 mt-2">{inc.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="w-2 h-2 mt-2 rounded-full bg-emerald-500"></div>
                  <div>
                    <p className="text-sm font-medium">Creado</p>
                    <p className="text-xs text-slate-500">
                      {grn.created_date && format(new Date(grn.created_date), 'dd/MM/yyyy HH:mm')}
                    </p>
                  </div>
                </div>
                {grn.ocr_processed && (
                  <div className="flex gap-3">
                    <div className="w-2 h-2 mt-2 rounded-full bg-blue-500"></div>
                    <div>
                      <p className="text-sm font-medium">OCR Procesado</p>
                      <p className="text-xs text-slate-500">Confianza: {(grn.ocr_confidence * 100).toFixed(0)}%</p>
                    </div>
                  </div>
                )}
                {grn.validated_at && (
                  <div className="flex gap-3">
                    <div className="w-2 h-2 mt-2 rounded-full bg-amber-500"></div>
                    <div>
                      <p className="text-sm font-medium">Validado</p>
                      <p className="text-xs text-slate-500">
                        {format(new Date(grn.validated_at), 'dd/MM/yyyy HH:mm')} por {grn.validated_by_name}
                      </p>
                    </div>
                  </div>
                )}
                {grn.posted_at && (
                  <div className="flex gap-3">
                    <div className="w-2 h-2 mt-2 rounded-full bg-green-500"></div>
                    <div>
                      <p className="text-sm font-medium">Contabilizado</p>
                      <p className="text-xs text-slate-500">
                        {format(new Date(grn.posted_at), 'dd/MM/yyyy HH:mm')}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Incident Dialog */}
      <Dialog open={showIncidentDialog} onOpenChange={setShowIncidentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Incidencia</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select 
                  value={incidentData.incident_type}
                  onValueChange={(v) => setIncidentData({ ...incidentData, incident_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="price_mismatch">Diferencia de Precio</SelectItem>
                    <SelectItem value="qty_short">Cantidad Faltante</SelectItem>
                    <SelectItem value="damaged">Producto Dañado</SelectItem>
                    <SelectItem value="wrong_product">Producto Incorrecto</SelectItem>
                    <SelectItem value="missing_item">Artículo Faltante</SelectItem>
                    <SelectItem value="extra_item">Artículo Extra</SelectItem>
                    <SelectItem value="other">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Severidad</Label>
                <Select 
                  value={incidentData.severity}
                  onValueChange={(v) => setIncidentData({ ...incidentData, severity: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baja</SelectItem>
                    <SelectItem value="medium">Media</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea
                value={incidentData.description}
                onChange={(e) => setIncidentData({ ...incidentData, description: e.target.value })}
                placeholder="Describe la incidencia..."
              />
            </div>
            <div className="space-y-2">
              <Label>Impacto estimado (€)</Label>
              <Input
                type="number"
                step="0.01"
                value={incidentData.impact_eur}
                onChange={(e) => setIncidentData({ ...incidentData, impact_eur: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowIncidentDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => createIncidentMutation.mutate(incidentData)}
              disabled={createIncidentMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {createIncidentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}