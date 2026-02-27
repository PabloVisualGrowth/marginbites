import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { marginbites } from '@/api/marginbitesClient';
import { format, subDays, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  TrendingDown, TrendingUp, RefreshCw, Calendar, AlertTriangle,
  CheckCircle2, Target, ShoppingCart, Package, Trash2, ChefHat,
  Loader2, ArrowRight, Lightbulb, BarChart3
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, PieChart, Pie, Cell
} from 'recharts';
import { toast } from 'sonner';

const COLORS = ['#059669', '#d97706', '#dc2626', '#6366f1'];

export default function BleedPanel({ selectedLocationId }) {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(format(subDays(new Date(), 1), 'yyyy-MM-dd'));
  const [dateRange, setDateRange] = useState('7');

  const { data: foodCostData, isLoading: loadingFC } = useQuery({
    queryKey: ['foodCostDaily', selectedLocationId, selectedDate],
    queryFn: async () => {
      if (!selectedLocationId) return null;
      const data = await marginbites.entities.FoodCostDaily.filter({
        location_id: selectedLocationId,
        date: selectedDate
      });
      return data[0] || null;
    },
    enabled: !!selectedLocationId
  });

  const { data: gapAnalysis } = useQuery({
    queryKey: ['gapAnalysis', selectedLocationId, selectedDate],
    queryFn: async () => {
      if (!selectedLocationId) return null;
      const data = await marginbites.entities.GapAnalysis.filter({
        location_id: selectedLocationId,
        date: selectedDate
      });
      return data[0] || null;
    },
    enabled: !!selectedLocationId
  });

  const { data: recommendations = [] } = useQuery({
    queryKey: ['recommendations', selectedLocationId, selectedDate],
    queryFn: async () => {
      if (!selectedLocationId) return [];
      return marginbites.entities.Recommendation.filter({
        location_id: selectedLocationId,
        date: selectedDate
      }, '-estimated_impact_eur');
    },
    enabled: !!selectedLocationId
  });

  const { data: trendData = [] } = useQuery({
    queryKey: ['foodCostTrend', selectedLocationId, dateRange],
    queryFn: async () => {
      if (!selectedLocationId) return [];
      const startDate = format(subDays(new Date(), parseInt(dateRange)), 'yyyy-MM-dd');
      const data = await marginbites.entities.FoodCostDaily.filter({
        location_id: selectedLocationId
      }, 'date', 30);
      return data.filter(d => d.date >= startDate).map(d => ({
        date: format(parseISO(d.date), 'dd/MM'),
        theoretical: (d.theoretical_fc_pct * 100).toFixed(1),
        actual: (d.actual_fc_pct * 100).toFixed(1),
        gap: (d.gap_pct * 100).toFixed(1)
      }));
    },
    enabled: !!selectedLocationId
  });

  const regeneratePanelMutation = useMutation({
    mutationFn: async () => {
      // Simular regeneración del panel
      const sales = await marginbites.entities.SalesDaily.filter({
        location_id: selectedLocationId,
        sale_date: selectedDate
      });
      const totalSales = sales.reduce((sum, s) => sum + (s.net_sales_amount || 0), 0);

      const consumption = await marginbites.entities.TheoreticalConsumption.filter({
        location_id: selectedLocationId,
        consumption_date: selectedDate
      });
      const theoreticalCogs = consumption.reduce((sum, c) => sum + (c.total_cost || 0), 0);

      // Calcular COGS real (simplificado)
      const stockData = await marginbites.entities.StockOnHand.filter({ location_id: selectedLocationId });
      const closingStockValue = stockData.reduce((sum, s) => sum + (s.total_value || 0), 0);
      
      const grns = await marginbites.entities.GRN.filter({
        location_id: selectedLocationId,
        delivery_date: selectedDate,
        status: 'Posted'
      });
      const purchasesValue = grns.reduce((sum, g) => sum + (g.total_amount || 0), 0);

      // Simplificación: actual_cogs = purchases (para demo)
      const actualCogs = purchasesValue > 0 ? purchasesValue : theoreticalCogs * 1.05;

      const theoreticalFcPct = totalSales > 0 ? theoreticalCogs / totalSales : 0;
      const actualFcPct = totalSales > 0 ? actualCogs / totalSales : 0;
      const gapPct = actualFcPct - theoreticalFcPct;
      const gapEur = actualCogs - theoreticalCogs;

      // Crear o actualizar food cost daily
      const existing = await marginbites.entities.FoodCostDaily.filter({
        location_id: selectedLocationId,
        date: selectedDate
      });

      const fcData = {
        date: selectedDate,
        location_id: selectedLocationId,
        sales_amount: totalSales,
        theoretical_cogs: theoreticalCogs,
        actual_cogs: actualCogs,
        theoretical_fc_pct: theoreticalFcPct,
        actual_fc_pct: actualFcPct,
        gap_pct: gapPct,
        gap_eur: gapEur,
        purchases_value: purchasesValue,
        closing_stock_value: closingStockValue,
        generated_at: new Date().toISOString(),
        status: 'Calculated'
      };

      if (existing.length > 0) {
        await marginbites.entities.FoodCostDaily.update(existing[0].id, fcData);
      } else {
        await marginbites.entities.FoodCostDaily.create(fcData);
      }

      // Generar análisis de gap si gap > 2%
      if (Math.abs(gapPct) > 0.02) {
        const incidents = await marginbites.entities.GRNIncident.filter({
          resolved: false
        });
        const incidentsImpact = incidents.reduce((sum, i) => sum + (i.impact_eur || 0), 0);

        const wasteMovements = await marginbites.entities.LedgerMovement.filter({
          location_id: selectedLocationId,
          movement_type: 'WASTE_OUT',
          movement_date: selectedDate
        });
        const wasteValue = wasteMovements.reduce((sum, m) => sum + (m.total_cost || 0), 0);

        const totalGapEur = Math.abs(gapEur);
        const driver1 = totalGapEur * 0.4; // Precios
        const driver2 = incidentsImpact || totalGapEur * 0.2; // Incidencias
        const driver3 = totalGapEur * 0.25; // Mermas producción
        const driver4 = wasteValue || totalGapEur * 0.15; // Waste servicio

        const analysisData = {
          date: selectedDate,
          location_id: selectedLocationId,
          driver_1_purchases_price_eur: driver1,
          driver_2_reception_incidents_eur: driver2,
          driver_3_yield_waste_eur: driver3,
          driver_4_service_waste_eur: driver4,
          driver_1_pct: driver1 / totalGapEur * 100,
          driver_2_pct: driver2 / totalGapEur * 100,
          driver_3_pct: driver3 / totalGapEur * 100,
          driver_4_pct: driver4 / totalGapEur * 100,
          top_products: [],
          top_dishes: []
        };

        const existingAnalysis = await marginbites.entities.GapAnalysis.filter({
          location_id: selectedLocationId,
          date: selectedDate
        });

        if (existingAnalysis.length > 0) {
          await marginbites.entities.GapAnalysis.update(existingAnalysis[0].id, analysisData);
        } else {
          await marginbites.entities.GapAnalysis.create(analysisData);
        }

        // Generar recomendaciones
        await generateRecommendations(analysisData, selectedLocationId, selectedDate);
      }
    },
    onSuccess: () => {
      toast.success('Panel regenerado correctamente');
      queryClient.invalidateQueries({ queryKey: ['foodCostDaily'] });
      queryClient.invalidateQueries({ queryKey: ['gapAnalysis'] });
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
    },
    onError: () => {
      toast.error('Error al regenerar el panel');
    }
  });

  const generateRecommendations = async (analysis, locationId, date) => {
    // Eliminar recomendaciones anteriores del día
    const oldRecs = await marginbites.entities.Recommendation.filter({
      location_id: locationId,
      date: date
    });
    for (const rec of oldRecs) {
      await marginbites.entities.Recommendation.delete(rec.id);
    }

    const recs = [];

    if (analysis.driver_1_pct > 40) {
      recs.push({
        date,
        location_id: locationId,
        priority: 'High',
        title: 'Revisar precios de compra',
        text: `Los precios de compra están impactando un ${analysis.driver_1_pct.toFixed(0)}% del gap. Revisa los últimos albaranes y negocia con proveedores.`,
        estimated_impact_eur: analysis.driver_1_purchases_price_eur,
        related_driver: 'driver_1',
        source: 'rules',
        action_type: 'review_prices',
        status: 'Open'
      });
    }

    if (analysis.driver_2_pct > 30) {
      recs.push({
        date,
        location_id: locationId,
        priority: 'High',
        title: 'Reforzar control de recepciones',
        text: `Las incidencias de recepción representan un ${analysis.driver_2_pct.toFixed(0)}% del gap. Verifica los albaranes con más atención.`,
        estimated_impact_eur: analysis.driver_2_reception_incidents_eur,
        related_driver: 'driver_2',
        source: 'rules',
        action_type: 'check_reception',
        status: 'Open'
      });
    }

    if (analysis.driver_4_pct > 20) {
      recs.push({
        date,
        location_id: locationId,
        priority: 'Medium',
        title: 'Revisar mermas de servicio',
        text: `El waste de servicio representa un ${analysis.driver_4_pct.toFixed(0)}% del gap. Revisa las cantidades de platos devueltos o desechados.`,
        estimated_impact_eur: analysis.driver_4_service_waste_eur,
        related_driver: 'driver_4',
        source: 'rules',
        action_type: 'review_waste',
        status: 'Open'
      });
    }

    for (const rec of recs) {
      await marginbites.entities.Recommendation.create(rec);
    }
  };

  const gapPct = foodCostData?.gap_pct || 0;
  const gapStatus = Math.abs(gapPct) > 0.05 ? 'critical' : Math.abs(gapPct) > 0.02 ? 'warning' : 'good';

  const driversData = gapAnalysis ? [
    { name: 'Precios Compra', value: gapAnalysis.driver_1_pct, amount: gapAnalysis.driver_1_purchases_price_eur },
    { name: 'Incidencias', value: gapAnalysis.driver_2_pct, amount: gapAnalysis.driver_2_reception_incidents_eur },
    { name: 'Mermas Prod.', value: gapAnalysis.driver_3_pct, amount: gapAnalysis.driver_3_yield_waste_eur },
    { name: 'Waste Servicio', value: gapAnalysis.driver_4_pct, amount: gapAnalysis.driver_4_service_waste_eur },
  ] : [];

  const dateOptions = [];
  for (let i = 1; i <= 14; i++) {
    const d = subDays(new Date(), i);
    dateOptions.push({
      value: format(d, 'yyyy-MM-dd'),
      label: format(d, 'EEEE, d MMM', { locale: es })
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-slate-500">
            Analiza el gap entre food cost teórico y real
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedDate} onValueChange={setSelectedDate}>
            <SelectTrigger className="w-56">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dateOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            variant="outline"
            onClick={() => regeneratePanelMutation.mutate()}
            disabled={regeneratePanelMutation.isPending}
            className="gap-2"
          >
            {regeneratePanelMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Regenerar
          </Button>
        </div>
      </div>

      {loadingFC ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : !foodCostData ? (
        <Card>
          <CardContent className="py-20 text-center">
            <BarChart3 className="w-16 h-16 mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-700 mb-2">Sin datos para esta fecha</h3>
            <p className="text-slate-500 mb-4">No hay datos de food cost calculados para el día seleccionado</p>
            <Button 
              onClick={() => regeneratePanelMutation.mutate()}
              disabled={regeneratePanelMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Generar Panel
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Main KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-slate-500 mb-1">Ventas</p>
                <p className="text-2xl font-bold">{foodCostData.sales_amount?.toLocaleString('es-ES')}€</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-slate-500 mb-1">COGS Teórico</p>
                <p className="text-2xl font-bold">{foodCostData.theoretical_cogs?.toLocaleString('es-ES')}€</p>
                <p className="text-sm text-slate-400">{(foodCostData.theoretical_fc_pct * 100).toFixed(1)}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-slate-500 mb-1">COGS Real</p>
                <p className="text-2xl font-bold">{foodCostData.actual_cogs?.toLocaleString('es-ES')}€</p>
                <p className="text-sm text-slate-400">{(foodCostData.actual_fc_pct * 100).toFixed(1)}%</p>
              </CardContent>
            </Card>
            <Card className={
              gapStatus === 'critical' ? 'bg-red-50 border-red-200' :
              gapStatus === 'warning' ? 'bg-amber-50 border-amber-200' :
              'bg-emerald-50 border-emerald-200'
            }>
              <CardContent className="pt-6">
                <p className="text-sm text-slate-500 mb-1">Gap %</p>
                <div className="flex items-center gap-2">
                  <p className={`text-2xl font-bold ${
                    gapStatus === 'critical' ? 'text-red-600' :
                    gapStatus === 'warning' ? 'text-amber-600' :
                    'text-emerald-600'
                  }`}>
                    {gapPct >= 0 ? '+' : ''}{(gapPct * 100).toFixed(1)}%
                  </p>
                  {gapPct > 0 ? (
                    <TrendingUp className={`w-5 h-5 ${gapStatus === 'critical' ? 'text-red-500' : 'text-amber-500'}`} />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-emerald-500" />
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className={
              gapStatus === 'critical' ? 'bg-red-50 border-red-200' :
              gapStatus === 'warning' ? 'bg-amber-50 border-amber-200' :
              'bg-emerald-50 border-emerald-200'
            }>
              <CardContent className="pt-6">
                <p className="text-sm text-slate-500 mb-1">Gap €</p>
                <p className={`text-2xl font-bold ${
                  gapStatus === 'critical' ? 'text-red-600' :
                  gapStatus === 'warning' ? 'text-amber-600' :
                  'text-emerald-600'
                }`}>
                  {foodCostData.gap_eur >= 0 ? '+' : ''}{foodCostData.gap_eur?.toFixed(0)}€
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Drivers Analysis */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-emerald-600" />
                  Análisis de Drivers del Gap
                </CardTitle>
                <CardDescription>
                  Desglose de las causas principales del gap de food cost
                </CardDescription>
              </CardHeader>
              <CardContent>
                {driversData.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={driversData}
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            dataKey="value"
                            label={({ name, value }) => `${value.toFixed(0)}%`}
                          >
                            {driversData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => `${value.toFixed(1)}%`} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-4">
                      {driversData.map((driver, index) => (
                        <div key={driver.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: COLORS[index] }}
                            />
                            <span className="text-sm">{driver.name}</span>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{driver.value?.toFixed(0)}%</p>
                            <p className="text-xs text-slate-500">{driver.amount?.toFixed(0)}€</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-10 text-slate-500">
                    <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-2" />
                    <p>El gap está dentro de los límites aceptables</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recommendations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-amber-500" />
                  Recomendaciones
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recommendations.length === 0 ? (
                  <div className="text-center py-6 text-slate-500">
                    <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
                    <p className="text-sm">Sin recomendaciones pendientes</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recommendations.map(rec => (
                      <div 
                        key={rec.id} 
                        className={`p-3 rounded-lg border-l-4 ${
                          rec.priority === 'High' ? 'bg-red-50 border-red-500' :
                          rec.priority === 'Medium' ? 'bg-amber-50 border-amber-500' :
                          'bg-blue-50 border-blue-500'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-sm">{rec.title}</p>
                            <p className="text-xs text-slate-600 mt-1">{rec.text}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <Badge className={
                            rec.priority === 'High' ? 'bg-red-100 text-red-700' :
                            rec.priority === 'Medium' ? 'bg-amber-100 text-amber-700' :
                            'bg-blue-100 text-blue-700'
                          }>
                            {rec.priority}
                          </Badge>
                          <span className="text-sm font-medium text-slate-700">
                            {rec.estimated_impact_eur?.toFixed(0)}€
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Trend Chart */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Tendencia Food Cost</CardTitle>
                <CardDescription>Evolución del % de food cost teórico vs real</CardDescription>
              </div>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 días</SelectItem>
                  <SelectItem value="14">14 días</SelectItem>
                  <SelectItem value="30">30 días</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis 
                      tick={{ fontSize: 12 }} 
                      tickFormatter={(value) => `${value}%`}
                    />
                    <Tooltip 
                      formatter={(value) => `${value}%`}
                      labelFormatter={(label) => `Fecha: ${label}`}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="theoretical" 
                      stroke="#059669" 
                      strokeWidth={2}
                      name="FC Teórico %"
                      dot={{ r: 3 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="actual" 
                      stroke="#dc2626" 
                      strokeWidth={2}
                      name="FC Real %"
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}