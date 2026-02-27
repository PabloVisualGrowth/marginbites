import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { marginbites } from '@/api/marginbitesClient';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import {
  ArrowLeft, ShoppingCart, Send, Mail, MessageSquare,
  Loader2, CheckCircle2, Clock, Package
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const statusConfig = {
  Draft: { label: 'Borrador', color: 'bg-slate-100 text-slate-700' },
  Suggested: { label: 'Sugerido', color: 'bg-purple-100 text-purple-700' },
  Sent: { label: 'Enviado', color: 'bg-blue-100 text-blue-700' },
  Partially_Received: { label: 'Parcial', color: 'bg-amber-100 text-amber-700' },
  Received: { label: 'Recibido', color: 'bg-emerald-100 text-emerald-700' },
  Cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-700' },
};

export default function PODetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const poId = urlParams.get('id');

  const { data: po, isLoading } = useQuery({
    queryKey: ['purchaseOrder', poId],
    queryFn: async () => {
      const data = await marginbites.entities.PurchaseOrder.filter({ id: poId });
      return data[0];
    },
    enabled: !!poId
  });

  const { data: lines = [] } = useQuery({
    queryKey: ['poLines', poId],
    queryFn: () => marginbites.entities.POLine.filter({ purchase_order_id: poId }),
    enabled: !!poId
  });

  if (isLoading || !po) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const status = statusConfig[po.status] || statusConfig.Draft;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to={createPageUrl('PurchaseOrders')}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{po.po_number}</h1>
            <p className="text-slate-500">{po.supplier_name}</p>
          </div>
          <Badge className={status.color}>{status.label}</Badge>
        </div>
        <div className="flex gap-2">
          {['Draft', 'Suggested'].includes(po.status) && (
            <>
              <Button variant="outline" className="gap-2">
                <Mail className="w-4 h-4" />
                Enviar por Email
              </Button>
              <Button variant="outline" className="gap-2">
                <MessageSquare className="w-4 h-4" />
                Enviar por WhatsApp
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Fecha Pedido</p>
            <p className="text-lg font-semibold">
              {po.order_date ? format(new Date(po.order_date), 'dd/MM/yyyy') : '-'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Entrega Solicitada</p>
            <p className="text-lg font-semibold">
              {po.requested_delivery_date ? format(new Date(po.requested_delivery_date), 'dd/MM/yyyy') : '-'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Total Estimado</p>
            <p className="text-lg font-semibold">
              {po.total_estimated_amount?.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Origen</p>
            <Badge variant="outline" className="mt-1">
              {po.source === 'auto_suggestion' ? 'Sugerencia Auto' : 'Manual'}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Lines */}
      <Card>
        <CardHeader>
          <CardTitle>Líneas del Pedido ({lines.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Sugerido</TableHead>
                <TableHead className="text-right">Pedido</TableHead>
                <TableHead className="text-right">Recibido</TableHead>
                <TableHead className="text-right">Precio Unit.</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map(line => (
                <TableRow key={line.id}>
                  <TableCell className="font-medium">{line.product_name}</TableCell>
                  <TableCell className="text-slate-500">{line.product_sku}</TableCell>
                  <TableCell className="text-right">
                    {line.suggested_qty} {line.unit_code}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {line.ordered_qty} {line.unit_code}
                  </TableCell>
                  <TableCell className="text-right">
                    {line.received_qty > 0 ? `${line.received_qty} ${line.unit_code}` : '-'}
                  </TableCell>
                  <TableCell className="text-right">{line.unit_price_estimated?.toFixed(2)}€</TableCell>
                  <TableCell className="text-right font-medium">{line.line_total_estimated?.toFixed(2)}€</TableCell>
                  <TableCell>
                    <Badge className={
                      line.line_status === 'Received' ? 'bg-emerald-100 text-emerald-700' :
                      line.line_status === 'Partial' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-700'
                    }>
                      {line.line_status === 'Open' ? 'Abierto' :
                       line.line_status === 'Partial' ? 'Parcial' :
                       line.line_status === 'Received' ? 'Recibido' :
                       line.line_status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Notes */}
      {po.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-600">{po.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Suggestion Reasons */}
      {po.source === 'auto_suggestion' && lines.some(l => l.suggestion_reason) && (
        <Card>
          <CardHeader>
            <CardTitle>Razones de Sugerencia</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {lines.filter(l => l.suggestion_reason).map(line => (
                <div key={line.id} className="flex justify-between items-center p-2 bg-slate-50 rounded">
                  <span className="font-medium">{line.product_name}</span>
                  <span className="text-sm text-slate-500">{line.suggestion_reason}</span>
                </div>
              ))}
            </div>
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
                  {po.created_date && format(new Date(po.created_date), 'dd/MM/yyyy HH:mm')}
                </p>
              </div>
            </div>
            {po.sent_at && (
              <div className="flex gap-3">
                <div className="w-2 h-2 mt-2 rounded-full bg-blue-500"></div>
                <div>
                  <p className="text-sm font-medium">Enviado por {po.sent_via}</p>
                  <p className="text-xs text-slate-500">
                    {format(new Date(po.sent_at), 'dd/MM/yyyy HH:mm')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}