import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import {
  Plus, Search, Package, Upload, Eye, CheckCircle2,
  Clock, XCircle, AlertTriangle, Loader2, FileText,
  Camera, Scan
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
import { toast } from 'sonner';

const statusConfig = {
  Draft: { label: 'Borrador', color: 'bg-slate-100 text-slate-700', icon: FileText },
  OCR_Processing: { label: 'Procesando OCR', color: 'bg-blue-100 text-blue-700', icon: Scan },
  Pending_Validation: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700', icon: Clock },
  Validated: { label: 'Validado', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  Posted: { label: 'Contabilizado', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  Rejected: { label: 'Rechazado', color: 'bg-red-100 text-red-700', icon: XCircle },
};

export default function GRNList({ selectedLocationId }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const { data: grns = [], isLoading } = useQuery({
    queryKey: ['grns', selectedLocationId, statusFilter],
    queryFn: async () => {
      if (!selectedLocationId) return [];
      const filters = { location_id: selectedLocationId };
      if (statusFilter !== 'all') filters.status = statusFilter;
      return base44.entities.GRN.filter(filters, '-delivery_date', 50);
    },
    enabled: !!selectedLocationId
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(20);

    try {
      // Subir archivo
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setUploadProgress(50);

      // Crear GRN
      const grnCount = await base44.entities.GRN.list('-created_date', 1);
      const grnNum = grnCount.length > 0 ? parseInt(grnCount[0].grn_number?.split('-')[2] || '0') + 1 : 1;

      const grn = await base44.entities.GRN.create({
        grn_number: `GRN-${new Date().getFullYear()}-${String(grnNum).padStart(4, '0')}`,
        location_id: selectedLocationId,
        delivery_date: format(new Date(), 'yyyy-MM-dd'),
        albaran_file_url: file_url,
        status: 'OCR_Processing',
        ocr_processed: false
      });
      setUploadProgress(70);

      // Simular procesamiento OCR (stub)
      await processOCRStub(grn.id, file_url);
      setUploadProgress(100);

      toast.success('Albarán subido y procesado correctamente');
      queryClient.invalidateQueries({ queryKey: ['grns'] });
      setShowUploadDialog(false);

    } catch (error) {
      console.error(error);
      toast.error('Error al procesar el albarán');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const processOCRStub = async (grnId, fileUrl) => {
    // Stub de OCR - simula extracción de datos
    const suppliers = await base44.entities.Supplier.filter({ is_active: true });
    const products = await base44.entities.Product.filter({ is_active: true });
    
    const randomSupplier = suppliers[Math.floor(Math.random() * suppliers.length)];
    const randomProducts = products.slice(0, Math.min(3, products.length));

    const ocrResult = {
      supplier_name: randomSupplier?.name || 'Proveedor Demo',
      albaran_number: `ALB-${Date.now()}`,
      delivery_date: format(new Date(), 'yyyy-MM-dd'),
      line_items: randomProducts.map(p => ({
        description: p.product_name,
        product_id: p.id,
        quantity: Math.floor(Math.random() * 10) + 1,
        unit_price: (p.avg_price || 10) * (0.9 + Math.random() * 0.2),
        total: 0
      })),
      total_amount: 0,
      confidence: 0.75 + Math.random() * 0.2
    };

    ocrResult.line_items.forEach(item => {
      item.total = item.quantity * item.unit_price;
    });
    ocrResult.total_amount = ocrResult.line_items.reduce((sum, i) => sum + i.total, 0);

    // Actualizar GRN con datos OCR
    await base44.entities.GRN.update(grnId, {
      supplier_id: randomSupplier?.id,
      supplier_name: ocrResult.supplier_name,
      albaran_number: ocrResult.albaran_number,
      total_amount: ocrResult.total_amount,
      ocr_processed: true,
      ocr_confidence: ocrResult.confidence,
      ocr_provider: 'stub',
      ocr_raw_payload: ocrResult,
      status: 'Pending_Validation',
      lines_count: ocrResult.line_items.length
    });

    // Crear líneas de GRN
    for (const item of ocrResult.line_items) {
      const product = products.find(p => p.id === item.product_id);
      await base44.entities.GRNLine.create({
        grn_id: grnId,
        product_id: item.product_id,
        product_name: item.description,
        product_sku: product?.sku,
        raw_description: item.description,
        matched_confidence: ocrResult.confidence,
        unit_code: product?.purchase_unit_code || 'kg',
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.total,
        variance_price_vs_product_avg: item.unit_price - (product?.avg_price || item.unit_price),
        is_flagged: Math.abs(item.unit_price - (product?.avg_price || item.unit_price)) > 2
      });
    }
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
            Recibe y valida albaranes de proveedores con procesamiento OCR
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
                <p className="text-sm text-slate-500">Baja Confianza OCR</p>
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
                <SelectItem value="OCR_Processing">Procesando OCR</SelectItem>
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
                  <TableHead>OCR</TableHead>
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
                            <Badge className="bg-slate-100 text-slate-700">Pendiente</Badge>
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
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subir Albarán</DialogTitle>
            <DialogDescription>
              Sube una foto o PDF del albarán para procesarlo automáticamente con OCR
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {uploading ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                  <span className="text-sm">Procesando albarán...</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
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
                  <p className="text-xs text-slate-500">
                    PNG, JPG, PDF hasta 10MB
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
    </div>
  );
}