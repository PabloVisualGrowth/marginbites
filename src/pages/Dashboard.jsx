import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  TrendingDown, TrendingUp, Package, ShoppingCart, 
  ClipboardList, AlertTriangle, Euro, Warehouse,
  ArrowRight, Bell, CheckCircle2, Clock, XCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';

export default function Dashboard({ selectedLocationId }) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

  // Food cost panel de ayer
  const { data: foodCostData, isLoading: loadingFoodCost } = useQuery({
    queryKey: ['foodCostDaily', selectedLocationId, yesterday],
    queryFn: async () => {
      if (!selectedLocationId) return null;
      const data = await base44.entities.FoodCostDaily.filter({
        location_id: selectedLocationId,
        date: yesterday
      });
      return data[0] || null;
    },
    enabled: !!selectedLocationId
  });

  // Stock value
  const { data: stockData = [], isLoading: loadingStock } = useQuery({
    queryKey: ['stockOnHand', selectedLocationId],
    queryFn: async () => {
      if (!selectedLocationId) return [];
      return base44.entities.StockOnHand.filter({ location_id: selectedLocationId });
    },
    enabled: !!selectedLocationId
  });

  // GRNs pendientes
  const { data: pendingGRNs = [], isLoading: loadingGRNs } = useQuery({
    queryKey: ['pendingGRNs', selectedLocationId],
    queryFn: async () => {
      if (!selectedLocationId) return [];
      return base44.entities.GRN.filter({
        location_id: selectedLocationId,
        status: 'Pending_Validation'
      });
    },
    enabled: !!selectedLocationId
  });

  // Inventarios abiertos
  const { data: openInventories = [], isLoading: loadingInv } = useQuery({
    queryKey: ['openInventories', selectedLocationId],
    queryFn: async () => {
      if (!selectedLocationId) return [];
      return base44.entities.Inventory.filter({
        location_id: selectedLocationId,
        status: 'In_Progress'
      });
    },
    enabled: !!selectedLocationId
  });

  // Recomendaciones abiertas
  const { data: openRecommendations = [] } = useQuery({
    queryKey: ['openRecommendations', selectedLocationId],
    queryFn: async () => {
      if (!selectedLocationId) return [];
      return base44.entities.Recommendation.filter({
        location_id: selectedLocationId,
        status: 'Open'
      }, '-estimated_impact_eur', 5);
    },
    enabled: !!selectedLocationId
  });

  // Stock bajo
  const lowStockItems = stockData.filter(s => s.needs_reorder || s.is_negative);
  const totalStockValue = stockData.reduce((sum, s) => sum + (s.total_value || 0), 0);

  const gapPct = foodCostData?.gap_pct || 0;
  const gapStatus = gapPct > 0.05 ? 'critical' : gapPct > 0.02 ? 'warning' : 'good';

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Gap de ayer */}
        <Card className="relative overflow-hidden">
          <div className={`absolute top-0 right-0 w-24 h-24 rounded-full -translate-y-8 translate-x-8 ${
            gapStatus === 'critical' ? 'bg-red-500' : gapStatus === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
          } opacity-10`} />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Gap Food Cost (Ayer)</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingFoodCost ? (
              <Skeleton className="h-8 w-24" />
            ) : foodCostData ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className={`text-3xl font-bold ${
                    gapStatus === 'critical' ? 'text-red-600' : gapStatus === 'warning' ? 'text-amber-600' : 'text-emerald-600'
                  }`}>
                    {(gapPct * 100).toFixed(1)}%
                  </span>
                  {gapPct > 0 ? (
                    <TrendingUp className="w-5 h-5 text-red-500" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-emerald-500" />
                  )}
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  {foodCostData.gap_eur >= 0 ? '+' : ''}{foodCostData.gap_eur?.toFixed(0)}€ diferencia
                </p>
              </>
            ) : (
              <p className="text-slate-400 text-sm">Sin datos</p>
            )}
          </CardContent>
        </Card>

        {/* Valor Stock */}
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 rounded-full -translate-y-8 translate-x-8 bg-blue-500 opacity-10" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Valor Stock</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingStock ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-slate-900">
                    {totalStockValue.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  {stockData.length} productos en stock
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* GRNs Pendientes */}
        <Card className="relative overflow-hidden">
          <div className={`absolute top-0 right-0 w-24 h-24 rounded-full -translate-y-8 translate-x-8 ${
            pendingGRNs.length > 0 ? 'bg-amber-500' : 'bg-emerald-500'
          } opacity-10`} />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Recepciones Pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingGRNs ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className={`text-3xl font-bold ${pendingGRNs.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {pendingGRNs.length}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  {pendingGRNs.length > 0 ? 'Requieren validación' : 'Todo validado'}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Inventarios Abiertos */}
        <Card className="relative overflow-hidden">
          <div className={`absolute top-0 right-0 w-24 h-24 rounded-full -translate-y-8 translate-x-8 ${
            openInventories.length > 0 ? 'bg-purple-500' : 'bg-slate-300'
          } opacity-10`} />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Inventarios Abiertos</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingInv ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className={`text-3xl font-bold ${openInventories.length > 0 ? 'text-purple-600' : 'text-slate-400'}`}>
                    {openInventories.length}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  {openInventories.length > 0 ? 'En progreso' : 'Ninguno activo'}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - wider */}
        <div className="lg:col-span-2 space-y-6">
          {/* Food Cost Summary */}
          {foodCostData && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Resumen Food Cost - Ayer</CardTitle>
                <Link to={createPageUrl('BleedPanel')}>
                  <Button variant="ghost" size="sm" className="text-emerald-600">
                    Ver detalle <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-500">Ventas</p>
                    <p className="text-xl font-semibold">{foodCostData.sales_amount?.toLocaleString('es-ES')}€</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-500">COGS Teórico</p>
                    <p className="text-xl font-semibold">{foodCostData.theoretical_cogs?.toLocaleString('es-ES')}€</p>
                    <p className="text-xs text-slate-400">{(foodCostData.theoretical_fc_pct * 100).toFixed(1)}%</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-500">COGS Real</p>
                    <p className="text-xl font-semibold">{foodCostData.actual_cogs?.toLocaleString('es-ES')}€</p>
                    <p className="text-xs text-slate-400">{(foodCostData.actual_fc_pct * 100).toFixed(1)}%</p>
                  </div>
                  <div className={`p-4 rounded-lg ${
                    gapStatus === 'critical' ? 'bg-red-50' : gapStatus === 'warning' ? 'bg-amber-50' : 'bg-emerald-50'
                  }`}>
                    <p className="text-sm text-slate-500">Gap</p>
                    <p className={`text-xl font-semibold ${
                      gapStatus === 'critical' ? 'text-red-600' : gapStatus === 'warning' ? 'text-amber-600' : 'text-emerald-600'
                    }`}>
                      {foodCostData.gap_eur >= 0 ? '+' : ''}{foodCostData.gap_eur?.toFixed(0)}€
                    </p>
                    <p className="text-xs text-slate-500">{(gapPct * 100).toFixed(1)} puntos</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Productos con Stock Bajo */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Productos que Necesitan Reposición</CardTitle>
              <Link to={createPageUrl('Stock')}>
                <Button variant="ghost" size="sm" className="text-emerald-600">
                  Ver stock <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {lowStockItems.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-2" />
                  <p>Todos los productos tienen stock suficiente</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {lowStockItems.slice(0, 5).map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        {item.is_negative ? (
                          <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                            <XCircle className="w-5 h-5 text-red-600" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                            <AlertTriangle className="w-5 h-5 text-amber-600" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{item.product_name}</p>
                          <p className="text-sm text-slate-500">{item.product_sku}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold ${item.is_negative ? 'text-red-600' : 'text-amber-600'}`}>
                          {item.quantity_base?.toFixed(2)} {item.base_unit_code}
                        </p>
                        <p className="text-xs text-slate-500">
                          {item.days_of_stock ? `${item.days_of_stock.toFixed(0)} días` : 'Sin cobertura'}
                        </p>
                      </div>
                    </div>
                  ))}
                  {lowStockItems.length > 5 && (
                    <p className="text-center text-sm text-slate-500">
                      +{lowStockItems.length - 5} productos más
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Acciones Rápidas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Acciones Rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link to={createPageUrl('PurchaseOrders') + '?action=suggest'} className="block">
                <Button variant="outline" className="w-full justify-start gap-2">
                  <ShoppingCart className="w-4 h-4" />
                  Generar Sugerencias de Pedido
                </Button>
              </Link>
              <Link to={createPageUrl('GRNList') + '?action=new'} className="block">
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Package className="w-4 h-4" />
                  Registrar Nueva Recepción
                </Button>
              </Link>
              <Link to={createPageUrl('Inventories') + '?action=new'} className="block">
                <Button variant="outline" className="w-full justify-start gap-2">
                  <ClipboardList className="w-4 h-4" />
                  Iniciar Inventario
                </Button>
              </Link>
              <Link to={createPageUrl('BleedPanel') + '?action=recalc'} className="block">
                <Button variant="outline" className="w-full justify-start gap-2">
                  <TrendingDown className="w-4 h-4" />
                  Regenerar Panel Sangrado
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Recomendaciones */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Recomendaciones</CardTitle>
              <Badge variant="outline">{openRecommendations.length} abiertas</Badge>
            </CardHeader>
            <CardContent>
              {openRecommendations.length === 0 ? (
                <div className="text-center py-6 text-slate-500">
                  <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
                  <p className="text-sm">Sin recomendaciones pendientes</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {openRecommendations.map(rec => (
                    <div key={rec.id} className={`p-3 rounded-lg border-l-4 ${
                      rec.priority === 'High' ? 'bg-red-50 border-red-500' :
                      rec.priority === 'Medium' ? 'bg-amber-50 border-amber-500' :
                      'bg-blue-50 border-blue-500'
                    }`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-sm">{rec.title || 'Recomendación'}</p>
                          <p className="text-xs text-slate-600 mt-1 line-clamp-2">{rec.text}</p>
                        </div>
                        <Badge className={`shrink-0 ${
                          rec.priority === 'High' ? 'bg-red-100 text-red-700' :
                          rec.priority === 'Medium' ? 'bg-amber-100 text-amber-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {rec.estimated_impact_eur?.toFixed(0)}€
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* GRNs pendientes lista */}
          {pendingGRNs.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Recepciones Pendientes</CardTitle>
                <Link to={createPageUrl('GRNList') + '?status=Pending_Validation'}>
                  <Button variant="ghost" size="sm" className="text-emerald-600">
                    Ver todas
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {pendingGRNs.slice(0, 3).map(grn => (
                    <Link 
                      key={grn.id} 
                      to={createPageUrl('GRNDetail') + `?id=${grn.id}`}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <div>
                        <p className="font-medium text-sm">{grn.grn_number}</p>
                        <p className="text-xs text-slate-500">{grn.supplier_name}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-sm">{grn.total_amount?.toFixed(0)}€</p>
                        {grn.ocr_confidence < 0.8 && (
                          <Badge variant="destructive" className="text-xs">Baja confianza</Badge>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}