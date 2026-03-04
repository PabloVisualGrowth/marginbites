import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { marginbites } from '@/api/marginbitesClient';
import { transcribeAudio, extractPOFromTranscription, calculateSmartOrderQty } from '@/api/openaiClient';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import {
  Plus, Search, ShoppingCart, Send, Eye,
  CheckCircle2, Clock, XCircle, Package, Sparkles,
  Loader2, Mail, MessageSquare, FileText, Mic, MicOff,
  StopCircle, Trash2
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

  // Voice PO state
  const [showVoiceDialog, setShowVoiceDialog] = useState(false);
  const [voiceState, setVoiceState] = useState('idle'); // idle | recording | processing | review
  const [voiceTranscription, setVoiceTranscription] = useState('');
  const [extractedPO, setExtractedPO] = useState(null);
  const [voiceLines, setVoiceLines] = useState([]);
  const [voiceSupplierId, setVoiceSupplierId] = useState('');
  const [voiceNotes, setVoiceNotes] = useState('');
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [audioReady, setAudioReady] = useState(false);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['purchaseOrders', selectedLocationId, statusFilter],
    queryFn: async () => {
      if (!selectedLocationId) return [];
      const filters = { location_id: selectedLocationId };
      if (statusFilter !== 'all') filters.status = statusFilter;
      return marginbites.entities.PurchaseOrder.filter(filters, { sort: '-order_date', perPage: 50 });
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

  // Process audio when ready
  useEffect(() => {
    if (audioReady && voiceState === 'processing') {
      processVoiceAudio();
    }
  }, [audioReady]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        setAudioReady(true);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setVoiceState('recording');
    } catch {
      toast.error('No se pudo acceder al micrófono. Verifica los permisos.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      setAudioReady(false);
      setVoiceState('processing');
    }
  };

  const processVoiceAudio = async () => {
    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      // Step 1: Whisper transcription
      const transcription = await transcribeAudio(audioBlob);
      setVoiceTranscription(transcription);
      // Step 2: GPT-4o-mini extraction
      const poData = await extractPOFromTranscription(transcription, suppliers, products);
      setExtractedPO(poData);
      // Step 3: Match supplier
      const matchedSupplier = suppliers.find(s =>
        s.id === poData.supplier_id ||
        s.name.toLowerCase().includes((poData.supplier_name || '').toLowerCase()) ||
        (poData.supplier_name || '').toLowerCase().includes(s.name.toLowerCase())
      );
      setVoiceSupplierId(matchedSupplier?.id || '');
      setVoiceNotes(poData.notes || '');
      // Step 4: Map lines with product matching
      setVoiceLines((poData.lines || []).map(l => {
        const matchedProduct = products.find(p =>
          p.id === l.product_id ||
          p.product_name.toLowerCase().includes((l.product_name || '').toLowerCase()) ||
          (l.product_name || '').toLowerCase().includes(p.product_name.toLowerCase())
        );
        return {
          product_id: matchedProduct?.id || null,
          product_name: matchedProduct?.product_name || l.product_name,
          product_sku: matchedProduct?.sku || '',
          unit_code: l.unit || matchedProduct?.purchase_unit_code || matchedProduct?.base_unit_code || 'ud',
          ordered_qty: l.quantity || 1,
          unit_price: l.unit_price || matchedProduct?.avg_price || 0,
        };
      }));
      setVoiceState('review');
    } catch (err) {
      toast.error('Error al procesar el audio con IA');
      console.error(err);
      setVoiceState('idle');
    }
  };

  const confirmVoicePOMutation = useMutation({
    mutationFn: async () => {
      const supplier = suppliers.find(s => s.id === voiceSupplierId);
      const poCount = await marginbites.entities.PurchaseOrder.list('-created', 1);
      const poNum = poCount.length > 0
        ? parseInt(poCount[0].po_number?.split('-')[2] || '0') + 1 : 1;
      const totalAmount = voiceLines.reduce((sum, l) => sum + (l.ordered_qty * l.unit_price), 0);

      const po = await marginbites.entities.PurchaseOrder.create({
        po_number: `PO-${new Date().getFullYear()}-${String(poNum).padStart(4, '0')}`,
        location_id: selectedLocationId,
        supplier_id: voiceSupplierId,
        supplier_name: supplier?.name,
        order_date: format(new Date(), 'yyyy-MM-dd'),
        status: 'Draft',
        source: 'voice',
        notes: voiceNotes,
        total_estimated_amount: totalAmount,
        lines_count: voiceLines.length,
      });

      for (const line of voiceLines) {
        await marginbites.entities.POLine.create({
          purchase_order_id: po.id,
          po_number: po.po_number,
          product_id: line.product_id,
          product_name: line.product_name,
          product_sku: line.product_sku,
          unit_code: line.unit_code,
          ordered_qty: line.ordered_qty,
          unit_price_estimated: line.unit_price,
          line_total_estimated: line.ordered_qty * line.unit_price,
          line_status: 'Open',
        });
      }
      return po;
    },
    onSuccess: (po) => {
      toast.success(`Pedido ${po.po_number} creado por voz`);
      setShowVoiceDialog(false);
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      window.location.href = createPageUrl('PODetail') + `?id=${po.id}`;
    },
    onError: (err) => {
      toast.error('Error al crear el pedido');
      console.error(err);
    }
  });

  const generateSuggestionsMutation = useMutation({
    mutationFn: async () => {
      const stockMap = {};
      stockData.forEach(s => { stockMap[s.product_id] = s; });

      // Build items to order with stock and avg consumption
      const itemsToOrder = [];
      const bySupplier = {};

      for (const prod of products) {
        const stock = stockMap[prod.id];
        if (!stock?.needs_reorder && stock) continue;
        const supplierId = prod.default_supplier_id;
        if (!supplierId) continue;

        const currentStock = stock?.quantity_base || 0;
        // Fallback avg consumption: 1 unit/day if no data
        const avgDailyConsumption = stock?.avg_daily_consumption || 1;

        itemsToOrder.push({
          product_id: prod.id,
          product_name: prod.product_name,
          unit: prod.purchase_unit_code || prod.base_unit_code || 'ud',
          currentStock,
          avgDailyConsumption,
          avgPrice: prod.avg_price || 0,
          supplierId,
        });
      }

      // Get smart quantities from AI
      let smartQtyMap = {};
      if (itemsToOrder.length > 0) {
        try {
          const aiItems = await calculateSmartOrderQty(itemsToOrder, 7);
          aiItems.forEach(i => {
            smartQtyMap[i.product_id] = {
              qty: i.suggested_qty,
              reason: i.suggestion_reason,
            };
          });
        } catch {
          // Fallback to simple calculation if AI fails
          itemsToOrder.forEach(i => {
            const needed = Math.ceil((i.avgDailyConsumption * 7) - i.currentStock);
            smartQtyMap[i.product_id] = {
              qty: Math.max(1, needed),
              reason: `Stock ${i.currentStock.toFixed(1)}, cubrir 7 días`,
            };
          });
        }
      }

      // Group by supplier
      itemsToOrder.forEach(item => {
        if (!bySupplier[item.supplierId]) bySupplier[item.supplierId] = [];
        bySupplier[item.supplierId].push(item);
      });

      const poCount = await marginbites.entities.PurchaseOrder.list('-created', 1);
      let poNum = poCount.length > 0 ? parseInt(poCount[0].po_number?.split('-')[2] || '0') + 1 : 1;

      for (const [supplierId, items] of Object.entries(bySupplier)) {
        const supplier = suppliers.find(s => s.id === supplierId);
        if (!supplier || items.length === 0) continue;

        const totalAmount = items.reduce((sum, i) => {
          const qty = smartQtyMap[i.product_id]?.qty || 1;
          return sum + (qty * i.avgPrice);
        }, 0);

        const po = await marginbites.entities.PurchaseOrder.create({
          po_number: `PO-${new Date().getFullYear()}-${String(poNum++).padStart(4, '0')}`,
          location_id: selectedLocationId,
          supplier_id: supplierId,
          supplier_name: supplier.name,
          order_date: format(new Date(), 'yyyy-MM-dd'),
          status: 'Suggested',
          source: 'auto_suggestion',
          total_estimated_amount: totalAmount,
          lines_count: items.length
        });

        for (const item of items) {
          const smart = smartQtyMap[item.product_id] || { qty: 1, reason: 'Stock bajo' };
          await marginbites.entities.POLine.create({
            purchase_order_id: po.id,
            po_number: po.po_number,
            product_id: item.product_id,
            product_name: item.product_name,
            unit_code: item.unit,
            suggested_qty: smart.qty,
            ordered_qty: smart.qty,
            unit_price_estimated: item.avgPrice,
            line_total_estimated: smart.qty * item.avgPrice,
            suggestion_reason: smart.reason,
            line_status: 'Open'
          });
        }
      }

      return Object.keys(bySupplier).length;
    },
    onSuccess: (count) => {
      toast.success(`Se crearon ${count} pedidos sugeridos con cantidades IA`);
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

  const closeVoiceDialog = (open) => {
    if (!open && mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
    }
    setShowVoiceDialog(open);
    if (!open) {
      setVoiceState('idle');
      setVoiceTranscription('');
      setExtractedPO(null);
      setVoiceLines([]);
      setVoiceSupplierId('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-slate-500">
            Gestiona los pedidos a proveedores y genera sugerencias automáticas
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => setShowSuggestDialog(true)}
            className="gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Generar Sugerencias IA
          </Button>
          <Button
            variant="outline"
            onClick={() => { setVoiceState('idle'); setShowVoiceDialog(true); }}
            className="gap-2"
          >
            <Mic className="w-4 h-4" />
            Pedido por voz
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
            <DialogTitle>Generar Sugerencias de Pedido con IA</DialogTitle>
            <DialogDescription>
              La IA analizará el stock actual y calculará cantidades óptimas para cubrir 7 días de operación.
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
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Calculando con IA...</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" />Generar Sugerencias</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Voice PO Dialog */}
      <Dialog open={showVoiceDialog} onOpenChange={closeVoiceDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pedido por Voz</DialogTitle>
            <DialogDescription>
              Graba tu pedido en voz alta. Por ejemplo: "Pide a FrescoCarne 5 kilos de ternera y 2 cajas de tomate cherry"
            </DialogDescription>
          </DialogHeader>

          {/* IDLE */}
          {voiceState === 'idle' && (
            <div className="py-10 flex flex-col items-center gap-4">
              <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center">
                <Mic className="w-12 h-12 text-emerald-600" />
              </div>
              <p className="text-slate-500 text-sm text-center max-w-xs">
                Pulsa el botón y habla claro. Menciona el proveedor, los productos y las cantidades.
              </p>
              <Button onClick={startRecording} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                <Mic className="w-4 h-4" />
                Iniciar grabación
              </Button>
            </div>
          )}

          {/* RECORDING */}
          {voiceState === 'recording' && (
            <div className="py-10 flex flex-col items-center gap-4">
              <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center animate-pulse">
                <MicOff className="w-12 h-12 text-red-600" />
              </div>
              <p className="text-red-600 font-semibold text-lg">Grabando...</p>
              <p className="text-slate-500 text-sm text-center max-w-xs">
                Habla con claridad. Cuando termines, pulsa "Parar y procesar".
              </p>
              <Button onClick={stopRecording} variant="destructive" className="gap-2">
                <StopCircle className="w-4 h-4" />
                Parar y procesar
              </Button>
            </div>
          )}

          {/* PROCESSING */}
          {voiceState === 'processing' && (
            <div className="py-10 flex flex-col items-center gap-6">
              <Loader2 className="w-14 h-14 animate-spin text-emerald-600" />
              <div className="text-center">
                <p className="font-semibold text-lg">Procesando con IA...</p>
                <p className="text-slate-500 text-sm mt-1">Whisper transcribe el audio · GPT extrae el pedido</p>
              </div>
            </div>
          )}

          {/* REVIEW */}
          {voiceState === 'review' && extractedPO && (
            <div className="space-y-5">
              {/* Transcription */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs font-medium text-slate-500 mb-1">Transcripción detectada</p>
                <p className="text-sm italic text-slate-700">"{voiceTranscription}"</p>
              </div>

              {/* Supplier */}
              <div className="space-y-1.5">
                <Label>Proveedor *</Label>
                <Select value={voiceSupplierId} onValueChange={setVoiceSupplierId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!voiceSupplierId && extractedPO.supplier_name && (
                  <p className="text-xs text-amber-600">
                    IA detectó: "{extractedPO.supplier_name}" — selecciona manualmente si no coincide
                  </p>
                )}
              </div>

              {/* Lines */}
              <div className="space-y-1.5">
                <Label>Líneas del pedido</Label>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead>Producto</TableHead>
                        <TableHead className="w-24">Cantidad</TableHead>
                        <TableHead className="w-20">Unidad</TableHead>
                        <TableHead className="w-24">Precio/u</TableHead>
                        <TableHead className="w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {voiceLines.map((line, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Input
                              value={line.product_name}
                              onChange={e => {
                                const nl = [...voiceLines];
                                nl[idx] = { ...nl[idx], product_name: e.target.value };
                                setVoiceLines(nl);
                              }}
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number" step="0.1" min="0"
                              value={line.ordered_qty}
                              onChange={e => {
                                const nl = [...voiceLines];
                                nl[idx] = { ...nl[idx], ordered_qty: parseFloat(e.target.value) || 0 };
                                setVoiceLines(nl);
                              }}
                              className="h-8 w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={line.unit_code}
                              onChange={e => {
                                const nl = [...voiceLines];
                                nl[idx] = { ...nl[idx], unit_code: e.target.value };
                                setVoiceLines(nl);
                              }}
                              className="h-8 w-16"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number" step="0.01" min="0"
                              value={line.unit_price}
                              onChange={e => {
                                const nl = [...voiceLines];
                                nl[idx] = { ...nl[idx], unit_price: parseFloat(e.target.value) || 0 };
                                setVoiceLines(nl);
                              }}
                              className="h-8 w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost" size="icon"
                              onClick={() => setVoiceLines(voiceLines.filter((_, i) => i !== idx))}
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Button
                  variant="outline" size="sm"
                  onClick={() => setVoiceLines([...voiceLines, { product_id: null, product_name: '', product_sku: '', unit_code: 'ud', ordered_qty: 1, unit_price: 0 }])}
                  className="gap-1 mt-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Añadir línea
                </Button>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label>Notas</Label>
                <Input
                  value={voiceNotes}
                  onChange={e => setVoiceNotes(e.target.value)}
                  placeholder="Notas adicionales..."
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setVoiceState('idle')}>
                  Volver a grabar
                </Button>
                <Button
                  onClick={() => confirmVoicePOMutation.mutate()}
                  disabled={!voiceSupplierId || voiceLines.length === 0 || confirmVoicePOMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {confirmVoicePOMutation.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Creando...</>
                    : 'Confirmar y crear pedido'
                  }
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
