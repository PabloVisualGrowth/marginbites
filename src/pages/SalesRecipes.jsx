import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import {
  ChefHat, ShoppingBag, Upload, Search, Plus, Eye,
  Loader2, Link as LinkIcon, RefreshCw, FileSpreadsheet
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function SalesRecipes({ selectedLocationId }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('recipes');
  const [searchTerm, setSearchTerm] = useState('');
  const [showMapDialog, setShowMapDialog] = useState(false);
  const [selectedSalesItem, setSelectedSalesItem] = useState(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState('');

  const { data: recipes = [], isLoading: loadingRecipes } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => base44.entities.Recipe.filter({ is_active: true }),
  });

  const { data: salesItems = [], isLoading: loadingSales } = useQuery({
    queryKey: ['salesItems'],
    queryFn: () => base44.entities.SalesItem.list(),
  });

  const { data: salesDaily = [] } = useQuery({
    queryKey: ['salesDaily', selectedLocationId],
    queryFn: async () => {
      if (!selectedLocationId) return [];
      return base44.entities.SalesDaily.filter(
        { location_id: selectedLocationId },
        '-sale_date',
        100
      );
    },
    enabled: !!selectedLocationId
  });

  const { data: consumption = [] } = useQuery({
    queryKey: ['theoreticalConsumption', selectedLocationId],
    queryFn: async () => {
      if (!selectedLocationId) return [];
      return base44.entities.TheoreticalConsumption.filter(
        { location_id: selectedLocationId },
        '-consumption_date',
        100
      );
    },
    enabled: !!selectedLocationId
  });

  const mapSalesItemMutation = useMutation({
    mutationFn: async ({ salesItemId, recipeId }) => {
      const recipe = recipes.find(r => r.id === recipeId);
      await base44.entities.SalesItem.update(salesItemId, {
        recipe_id: recipeId,
        recipe_name: recipe?.recipe_name
      });
    },
    onSuccess: () => {
      toast.success('Mapeo actualizado');
      queryClient.invalidateQueries({ queryKey: ['salesItems'] });
      setShowMapDialog(false);
    },
    onError: () => {
      toast.error('Error al actualizar mapeo');
    }
  });

  const recalculateConsumptionMutation = useMutation({
    mutationFn: async () => {
      // Obtener ventas recientes sin consumo calculado
      const recentSales = salesDaily.filter(s => s.recipe_id);
      const recipeLines = await base44.entities.RecipeLine.list();
      const products = await base44.entities.Product.list();
      const productMap = {};
      products.forEach(p => { productMap[p.id] = p; });

      for (const sale of recentSales) {
        const lines = recipeLines.filter(rl => rl.recipe_id === sale.recipe_id);
        
        for (const line of lines) {
          const product = productMap[line.product_id];
          if (!product) continue;

          const consumedQty = (line.quantity_base || line.quantity) * sale.quantity_sold;
          const unitCost = product.avg_price || 0;

          // Buscar si ya existe
          const existing = await base44.entities.TheoreticalConsumption.filter({
            consumption_date: sale.sale_date,
            location_id: selectedLocationId,
            product_id: line.product_id,
            sales_item_id: sale.sales_item_id
          });

          const consumptionData = {
            consumption_date: sale.sale_date,
            location_id: selectedLocationId,
            product_id: line.product_id,
            product_name: product.product_name,
            product_sku: product.sku,
            sales_item_id: sale.sales_item_id,
            sales_item_name: sale.sales_item_name,
            recipe_id: sale.recipe_id,
            quantity_consumed_base: consumedQty,
            unit_cost: unitCost,
            total_cost: consumedQty * unitCost,
            source_sales_daily_id: sale.id
          };

          if (existing.length > 0) {
            await base44.entities.TheoreticalConsumption.update(existing[0].id, consumptionData);
          } else {
            await base44.entities.TheoreticalConsumption.create(consumptionData);
          }
        }
      }
    },
    onSuccess: () => {
      toast.success('Consumo teórico recalculado');
      queryClient.invalidateQueries({ queryKey: ['theoreticalConsumption'] });
    },
    onError: () => {
      toast.error('Error al recalcular');
    }
  });

  const openMapDialog = (salesItem) => {
    setSelectedSalesItem(salesItem);
    setSelectedRecipeId(salesItem.recipe_id || '');
    setShowMapDialog(true);
  };

  const filteredRecipes = recipes.filter(r => {
    if (!searchTerm) return true;
    return r.recipe_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
           r.recipe_code?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const filteredSalesItems = salesItems.filter(s => {
    if (!searchTerm) return true;
    return s.name?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const mappedCount = salesItems.filter(s => s.recipe_id).length;
  const unmappedCount = salesItems.length - mappedCount;

  const totalSalesToday = salesDaily
    .filter(s => s.sale_date === format(new Date(), 'yyyy-MM-dd'))
    .reduce((sum, s) => sum + (s.net_sales_amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Recetas Activas</p>
                <p className="text-2xl font-bold">{recipes.length}</p>
              </div>
              <ChefHat className="w-8 h-8 text-emerald-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Items de Venta</p>
                <p className="text-2xl font-bold">{salesItems.length}</p>
              </div>
              <ShoppingBag className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Sin Mapear</p>
                <p className="text-2xl font-bold text-amber-600">{unmappedCount}</p>
              </div>
              <LinkIcon className="w-8 h-8 text-amber-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Ventas Hoy</p>
                <p className="text-2xl font-bold">{totalSalesToday.toLocaleString('es-ES')}€</p>
              </div>
              <FileSpreadsheet className="w-8 h-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <TabsList>
            <TabsTrigger value="recipes" className="gap-2">
              <ChefHat className="w-4 h-4" />
              Recetas
            </TabsTrigger>
            <TabsTrigger value="sales" className="gap-2">
              <ShoppingBag className="w-4 h-4" />
              Items de Venta
            </TabsTrigger>
            <TabsTrigger value="consumption" className="gap-2">
              <FileSpreadsheet className="w-4 h-4" />
              Consumo Teórico
            </TabsTrigger>
          </TabsList>

          <div className="flex gap-2">
            {activeTab === 'consumption' && (
              <Button 
                variant="outline"
                onClick={() => recalculateConsumptionMutation.mutate()}
                disabled={recalculateConsumptionMutation.isPending}
                className="gap-2"
              >
                {recalculateConsumptionMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Recalcular
              </Button>
            )}
          </div>
        </div>

        <TabsContent value="recipes" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Buscar receta..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Ingredientes</TableHead>
                    <TableHead>Coste/Porción</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingRecipes ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                      </TableCell>
                    </TableRow>
                  ) : filteredRecipes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10 text-slate-500">
                        No hay recetas para mostrar
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRecipes.map(recipe => (
                      <TableRow key={recipe.id}>
                        <TableCell className="font-medium">{recipe.recipe_code}</TableCell>
                        <TableCell>{recipe.recipe_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{recipe.category}</Badge>
                        </TableCell>
                        <TableCell>{recipe.ingredients_count || 0}</TableCell>
                        <TableCell className="font-medium">
                          {recipe.cost_per_portion?.toFixed(2)}€
                        </TableCell>
                        <TableCell>
                          <Badge className={recipe.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}>
                            {recipe.is_active ? 'Activa' : 'Inactiva'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Buscar item de venta..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>ID Externo</TableHead>
                    <TableHead>Receta Mapeada</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingSales ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                      </TableCell>
                    </TableRow>
                  ) : filteredSalesItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10 text-slate-500">
                        No hay items de venta para mostrar
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSalesItems.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>{item.category || '-'}</TableCell>
                        <TableCell className="text-slate-500">{item.external_item_id || '-'}</TableCell>
                        <TableCell>
                          {item.recipe_name ? (
                            <Badge className="bg-emerald-100 text-emerald-700">
                              {item.recipe_name}
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-700">Sin mapear</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={item.is_active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}>
                            {item.is_active !== false ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => openMapDialog(item)}
                          >
                            <LinkIcon className="w-4 h-4 mr-1" />
                            Mapear
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="consumption" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Item Venta</TableHead>
                    <TableHead>Receta</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Coste Unit.</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consumption.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-10 text-slate-500">
                        No hay datos de consumo teórico
                      </TableCell>
                    </TableRow>
                  ) : (
                    consumption.slice(0, 50).map(c => (
                      <TableRow key={c.id}>
                        <TableCell>
                          {c.consumption_date ? format(new Date(c.consumption_date), 'dd/MM/yyyy') : '-'}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{c.product_name}</p>
                            <p className="text-xs text-slate-500">{c.product_sku}</p>
                          </div>
                        </TableCell>
                        <TableCell>{c.sales_item_name || '-'}</TableCell>
                        <TableCell>{c.recipe_name || '-'}</TableCell>
                        <TableCell className="text-right">
                          {c.quantity_consumed_base?.toFixed(3)}
                        </TableCell>
                        <TableCell className="text-right">
                          {c.unit_cost?.toFixed(2)}€
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {c.total_cost?.toFixed(2)}€
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Map Dialog */}
      <Dialog open={showMapDialog} onOpenChange={setShowMapDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mapear Item de Venta a Receta</DialogTitle>
            <DialogDescription>
              Selecciona la receta correspondiente a "{selectedSalesItem?.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Receta</Label>
            <Select value={selectedRecipeId} onValueChange={setSelectedRecipeId}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Selecciona una receta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>Sin mapear</SelectItem>
                {recipes.map(recipe => (
                  <SelectItem key={recipe.id} value={recipe.id}>
                    {recipe.recipe_name} ({recipe.recipe_code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMapDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => mapSalesItemMutation.mutate({
                salesItemId: selectedSalesItem?.id,
                recipeId: selectedRecipeId || null
              })}
              disabled={mapSalesItemMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {mapSalesItemMutation.isPending ? (
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