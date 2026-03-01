import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { marginbites } from '@/api/marginbitesClient';
import { extractGRNFromImage } from '@/api/openaiClient';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import {
  Plus, Search, Package, Upload, Eye, CheckCircle2,
  Clock, XCircle, AlertTriangle, Loader2, FileText,
  Camera, Scan, Trash2, Sparkles
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { toast } from 'sonner';

const statusConfig = {
  Draft: { label: 'Borrador', color: 'bg-slate-100 text-slate-700', icon: FileText },
  OCR_Processing: { label: 'Procesando IA', color: 'bg-blue-100 text-blue-700', icon: Scan },
  Pending_Validation: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700', icon: Clock },
  Validated: { label: 'Validado', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  Posted: { label: 'Contabilizado', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  Rejected: { label: 'Rechazado', color: 'bg-red-100 text-red-700', icon: XCircle },
};

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result.split(',')[1]);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

export default function GRNList({ selectedLocationId }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStep, setUploadStep] = useState('');

  // Validation dialog state
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);
  const [pendingFileUrl, setPendingFileUrl] = useState('');
  const [validationData, setValidationData] = useState({
    supplier_id: '',
    supplier_name_raw: '',
    delivery_date: format(new Date(), 'yyyy-MM-dd'),
    albaran_number: '',
    lines: [],
  });

  const { data: grns = [], isLoading } = useQuery({
    queryKey: ['grns', selectedLocationId, statusFilter],
    queryFn: async () => {
      if (!selectedLocationId) return [];
      const filters = { location_id: selectedLocationId };
      if (statusFilter !== 'all') filters.status = statusFilter;
      return marginbites.entities.GRN.filter(filters, '-delivery_date', 50);
    },
    enabled: !!selectedLocationId
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => marginbites.entities.Supplier.filter({ is_active: true }),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => marginbites.entities.Product.filter({ is_active: true }),
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(15);
    setUploadStep('Subiendo archivo...');

    try {
      // Phase 1: Upload file
      const { file_url } = await marginbites.integrations.Core.UploadFile({ file });
      setPendingFileUrl(file_url);
      setUploadProgress(40);
      setUploadStep('Analizando imagen con IA...');

      // Phase 2: Convert to base64
      const base64 = await fileToBase64(file);
      const mimeType = file.type || 'image/jpeg';
      setUploadProgress(60);

      // Phase 3: Call Vision API
      const extracted = await extractGRNFromImage(base64, mimeType);
      setOcrResult(extracted);
      setUploadProgress(85);
      setUploadStep('Buscando coincidencias...');

      // Phase 4: Match supplier
      const matchedSupplier = suppliers.find(s => {
        const sName = s.name.toLowerCase();
        const eName = (extracted.supplier_name || '').toLowerCase();
        return sName.includes(eName) || eName.includes(sName);
      });

      // Phase 5: Map lines with product matching
      const mappedLines = (extracted.lines || []).map(l => {
        const matchedProduct = products.find(p => {
          const pName = p.product_name.toLowerCase();
          const lName = (l.product_name || '').toLowerCase();
          return pName.includes(lName) || lName.includes(pName);
        });
        return {
          raw_description: l.product_name,
          product_id: matchedProduct?.id || null,
          product_name: matchedProduct?.product_name || l.product_name,
          product_sku: matchedProduct?.sku || '',
          quantity: l.quantity || 0,
          unit_code: l.unit || matchedProduct?.purchase_unit_code || 'ud',
          unit_price: l.unit_price || 0,
          line_total: l.total || (l.quantity * l.unit_price) || 0,
          matched_confidence: extracted.confidence || 0.8,
        };
      });

      setValidationData({
        supplier_id: matchedSupplier?.id || '',
        supplier_name_raw: extracted.supplier_name || '',
        delivery_date: extracted.delivery_date || format(new Date(), 'yyyy-MM-dd'),
        albaran_number: extracted.albaran_number || '',
        lines: mappedLines,
      });

      setUploadProgress(100);
      setShowUploadDialog(false);
      setShowValidationDialog(true);

    } catch (error) {
      console.error(error);
      toast.error('Error al procesar el albarán con IA. Verifica la imagen e inténtalo de nuevo.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadStep('');
    }
  };

  const confirmGRNMutation = useMutation({
    mutationFn: async () => {
      const supplier = suppliers.find(s => s.id === validationData.supplier_id);
      const grnCount = await marginbites.entities.GRN.list('-created_date', 1);
      const grnNum = grnCount.length > 0
        ? parseInt(grnCount[0].grn_number?.split('-')[2] || '0') + 1 : 1;

      const totalAmount = validationData.lines.reduce((sum, l) => sum + (l.line_total || 0), 0);

      const grn = await marginbites.entities.GRN.create({
        grn_number: `GRN-${new Date().getFullYear()}-${String(grnNum).padStart(4, '0')}`,
        location_id: selectedLocationId,
        supplier_id: validationData.supplier_id || null,
        supplier_name: supplier?.name || validationData.supplier_name_raw,
        delivery_date: validationData.delivery_date,
        albaran_number: validationData.albaran_number,
        albaran_file_url: pendingFileUrl,
        total_amount: totalAmount,
        lines_count: validationData.lines.length,
        ocr_processed: true,
        ocr_confidence: ocrResult?.confidence || 0.8,
        ocr_provider: 'gpt-4o-mini',
        ocr_raw_payload: ocrResult,
        status: 'Pending_Validation',
      });

      for (const line of validationData.lines) {
        const product = products.find(p => p.id === line.product_id);
        await marginbites.entities.GRNLine.create({
          grn_id: grn.id,
          product_id: line.product_id || null,
          product_name: line.product_name,
          product_sku: line.product_sku || product?.sku,
          raw_description: line.raw_description,
          matched_confidence: line.matched_confidence,
          unit_code: line.unit_code,
          quantity: line.quantity,
          unit_price: line.unit_price,
          line_total: line.line_total,
          variance_price_vs_product_avg: line.unit_price - (product?.avg_price || line.unit_price),
          is_flagged: Math.abs(line.unit_price - (product?.avg_price || line.unit_price)) > 2,
        });
      }

      return grn;
    },
    onSuccess: (grn) => {
      toast.success(`Albarán ${grn.grn_number} registrado correctamente`);
      setShowValidationDialog(false);
      queryClient.invalidateQueries({ queryKey: ['grns'] });
    },
    onError: (err) => {
      toast.error('Error al guardar el albarán');
      console.error(err);
    }
  });

  const updateLine = (idx, field, value) => {
    setValidationData(prev => {
      const lines = [...prev.lines];
      lines[idx] = { ...lines[idx], [field]: value };
      // Recalculate total if qty or price changes
      if (field === 'quantity' || field === 'unit_price') {
        lines[idx].line_total = (lines[idx].quantity || 0) * (lines[idx].unit_price || 0);
      }
      return { ...prev, lines };
    });
  };

  const filteredGRNs = grns.filter(grn => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      grn.grn_number?.toLowerCase().includes(term) ||
      grn.supplier_name?.toLowerCase().includes(term) ||
      grn.albaran_number?.toLowerCase().includes(term)
    );
  });

  const pendingCount = grns.filter(g => g.status === 'Pending_Validation').length;
  const lowConfidenceCount = grns.filter(g => g.ocr_confidence < 0.8 && g.status === 'Pending_Validation').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-slate-500">
            Recibe y valida albaranes de proveedores con procesamiento IA
          </p>
        </div>
        <Button
          onClick={() => setShowUploadDialog(true)}
          className="gap-2 bg-emerald-600 hover:bg-emerald-700"
        >
          <Upload className="w-4 h-4" />
          Subir Albarán
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Pendientes de Validar</p>
                <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
              </div>
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                <Clock className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Baja Confianza IA</p>
                <p className="text-2xl font-bold text-red-600">{lowConfidenceCount}</p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total del Mes</p>
                <p className="text-2xl font-bold text-slate-900">{grns.length}</p>
              </div>
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                <Package className="w-6 h-6 text-emerald-600" />
              </div>
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
                placeholder="Buscar por número, proveedor o albarán..."
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
                <SelectItem value="OCR_Processing">Procesando IA</SelectItem>
                <SelectItem value="Pending_Validation">Pendiente Validación</SelectItem>
                <SelectItem value="Validated">Validado</SelectItem>
                <SelectItem value="Posted">Contabilizado</SelectItem>
                <SelectItem value="Rejected">Rechazado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* GRNs Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Recepción</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Nº Albarán</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>IA</TableHead>
                  <TableHead className="text-right">Total</TableHead>
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
                ) : filteredGRNs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-slate-500">
                      No hay recepciones para mostrar
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredGRNs.map(grn => {
                    const status = statusConfig[grn.status] || statusConfig.Draft;
                    const StatusIcon = status.icon;
                    const confidenceOk = grn.ocr_confidence >= 0.8;
                    return (
                      <TableRow key={grn.id} className="hover:bg-slate-50">
                        <TableCell className="font-medium">
                          <Link
                            to={createPageUrl('GRNDetail') + `?id=${grn.id}`}
                            className="text-emerald-600 hover:underline"
                          >
                            {grn.grn_number}
                          </Link>
                        </TableCell>
                        <TableCell>{grn.supplier_name || '-'}</TableCell>
                        <TableCell>{grn.albaran_number || '-'}</TableCell>
                        <TableCell>
                          {grn.delivery_date ? format(new Date(grn.delivery_date), 'dd/MM/yyyy') : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${status.color} gap-1`}>
                            <StatusIcon className="w-3 h-3" />
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {grn.ocr_processed ? (
                            <Badge className={confidenceOk ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                              {(grn.ocr_confidence * 100).toFixed(0)}%
                            </Badge>
                          ) : (
                            <Badge className="bg-slate-100 text-slate-700">—</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {grn.total_amount?.toLocaleString('es-ES', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}€
                        </TableCell>
                        <TableCell className="text-right">
                          <Link to={createPageUrl('GRNDetail') + `?id=${grn.id}`}>
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

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={(open) => { if (!uploading) setShowUploadDialog(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subir Albarán</DialogTitle>
            <DialogDescription>
              Sube una foto o PDF del albarán. La IA extraerá automáticamente los datos para que los revises antes de guardar.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {uploading ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 animate-pulse text-emerald-600" />
                  <span className="text-sm font-medium">{uploadStep}</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-xs text-slate-500 text-center">
                  GPT-4o-mini está leyendo el albarán...
                </p>
              </div>
            ) : (
              <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center">
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Camera className="w-8 h-8 text-emerald-600" />
                  </div>
                  <p className="text-sm font-medium text-slate-700 mb-1">
                    Haz clic para subir o arrastra el archivo
                  </p>
                  <p className="text-xs text-slate-500">PNG, JPG, PDF hasta 10MB</p>
                  <p className="text-xs text-emerald-600 mt-2">
                    ✨ La IA leerá el albarán y rellenará los campos automáticamente
                  </p>
                </label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)} disabled={uploading}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Validation Dialog */}
      <Dialog open={showValidationDialog} onOpenChange={(open) => { if (!confirmGRNMutation.isPending) setShowValidationDialog(open); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Revisar datos extraídos por IA</DialogTitle>
            <DialogDescription>
              Revisa y corrige los datos antes de guardar el albarán.
              {ocrResult?.confidence && (
                <span className={`ml-2 font-medium ${ocrResult.confidence >= 0.8 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  Confianza IA: {(ocrResult.confidence * 100).toFixed(0)}%
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Supplier */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Proveedor</Label>
                <Select
                  value={validationData.supplier_id}
                  onValueChange={v => setValidationData(prev => ({ ...prev, supplier_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {validationData.supplier_name_raw && !validationData.supplier_id && (
                  <p className="text-xs text-amber-600">IA detectó: "{validationData.supplier_name_raw}"</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Nº Albarán</Label>
                <Input
                  value={validationData.albaran_number}
                  onChange={e => setValidationData(prev => ({ ...prev, albaran_number: e.target.value }))}
                  placeholder="Número de albarán"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Fecha de entrega</Label>
              <Input
                type="date"
                value={validationData.delivery_date}
                onChange={e => setValidationData(prev => ({ ...prev, delivery_date: e.target.value }))}
                className="w-48"
              />
            </div>

            {/* Lines */}
            <div className="space-y-2">
              <Label>Líneas del albarán ({validationData.lines.length})</Label>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Producto detectado</TableHead>
                      <TableHead className="w-24">Cantidad</TableHead>
                      <TableHead className="w-20">Unidad</TableHead>
                      <TableHead className="w-28">Precio/u</TableHead>
                      <TableHead className="w-28">Total</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validationData.lines.map((line, idx) => (
                      <TableRow key={idx} className={!line.product_id ? 'bg-amber-50' : ''}>
                        <TableCell>
                          <Input
                            value={line.product_name}
                            onChange={e => updateLine(idx, 'product_name', e.target.value)}
                            className="h-8"
                            title={line.raw_description !== line.product_name ? `Original: "${line.raw_description}"` : ''}
                          />
                          {!line.product_id && (
                            <p className="text-xs text-amber-600 mt-0.5">No encontrado en catálogo</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number" step="0.01" min="0"
                            value={line.quantity}
                            onChange={e => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)}
                            className="h-8 w-20"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={line.unit_code}
                            onChange={e => updateLine(idx, 'unit_code', e.target.value)}
                            className="h-8 w-16"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number" step="0.01" min="0"
                            value={line.unit_price}
                            onChange={e => updateLine(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="h-8 w-24"
                          />
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {(line.line_total || 0).toFixed(2)}€
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => setValidationData(prev => ({
                              ...prev,
                              lines: prev.lines.filter((_, i) => i !== idx)
                            }))}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between">
                <Button
                  variant="outline" size="sm"
                  onClick={() => setValidationData(prev => ({
                    ...prev,
                    lines: [...prev.lines, { raw_description: '', product_id: null, product_name: '', product_sku: '', quantity: 0, unit_code: 'ud', unit_price: 0, line_total: 0, matched_confidence: 1 }]
                  }))}
                  className="gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Añadir línea
                </Button>
                <p className="text-sm font-semibold text-slate-700">
                  Total: {validationData.lines.reduce((s, l) => s + (l.line_total || 0), 0).toFixed(2)}€
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setShowValidationDialog(false); setShowUploadDialog(true); }}
              disabled={confirmGRNMutation.isPending}
            >
              Volver a subir
            </Button>
            <Button
              onClick={() => confirmGRNMutation.mutate()}
              disabled={confirmGRNMutation.isPending || validationData.lines.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {confirmGRNMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Guardando...</>
                : 'Confirmar y registrar albarán'
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
