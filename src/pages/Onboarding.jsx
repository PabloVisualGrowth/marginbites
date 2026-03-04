import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { marginbites } from '@/api/marginbitesClient';
import { login as tspoonLogin, getOrderCenters, listIngredients, listRecipes, listDishes } from '@/api/tspoonlab';
import {
  Building2, Link, Loader2, CheckCircle2, ArrowRight,
  Package, ChefHat, AlertTriangle
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { toast } from 'sonner';

const STEPS = {
  CREDENTIALS: 'credentials',
  SELECT_CENTER: 'select_center',
  IMPORT: 'import',
  DONE: 'done',
};

// Fetch all pages of a paginated tSpoonLab endpoint
async function fetchAllPages(fetchFn, token, idOrderCenter, rowsPerPage = 100) {
  const all = [];
  let start = 0;
  while (true) {
    const page = await fetchFn(token, idOrderCenter, { start, rows: rowsPerPage });
    const items = Array.isArray(page) ? page : [];
    all.push(...items);
    if (items.length < rowsPerPage) break;
    start += rowsPerPage;
  }
  return all;
}

export default function Onboarding() {
  const navigate = useNavigate();

  const [step, setStep] = useState(STEPS.CREDENTIALS);
  const [isLoading, setIsLoading] = useState(false);

  // Form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // After login
  const [token, setToken] = useState('');
  const [orderCenters, setOrderCenters] = useState([]);
  const [selectedCenterId, setSelectedCenterId] = useState('');

  // Import progress
  const [importLog, setImportLog] = useState([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importStats, setImportStats] = useState({ products: 0, recipes: 0, errors: 0 });

  const log = (msg) => setImportLog(prev => [...prev, msg]);

  // ── Step 1: Connect ──────────────────────────────────────────────────────────

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!username || !password) return;
    setIsLoading(true);
    try {
      const t = await tspoonLogin(username, password);
      setToken(t);
      const centers = await getOrderCenters(t);
      setOrderCenters(centers ?? []);
      if ((centers ?? []).length === 1) {
        setSelectedCenterId(String(centers[0].idOrderCenter));
      }
      setStep(STEPS.SELECT_CENTER);
    } catch (err) {
      console.error(err);
      toast.error('No se pudo conectar a tSpoonLab. Verifica usuario y contraseña.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Step 2: Start import ─────────────────────────────────────────────────────

  const handleStartImport = async () => {
    if (!selectedCenterId) return;
    setIsLoading(true);
    setStep(STEPS.IMPORT);
    setImportLog([]);
    setImportProgress(0);

    const stats = { products: 0, recipes: 0, errors: 0 };

    try {
      // Save credentials
      const existing = await marginbites.entities.AppSetting.filter({ key: 'tspoonlab' });
      const credPayload = {
        key: 'tspoonlab',
        value: JSON.stringify({
          username,
          password,
          token,
          idOrderCenter: selectedCenterId,
          centerName: orderCenters.find(c => String(c.idOrderCenter) === selectedCenterId)?.name || selectedCenterId,
          connectedAt: new Date().toISOString(),
        }),
      };
      if (existing.length > 0) {
        await marginbites.entities.AppSetting.update(existing[0].id, credPayload);
      } else {
        await marginbites.entities.AppSetting.create(credPayload);
      }

      // ── 1. Import ingredients → products ──────────────────────────────────

      log('Descargando ingredientes de tSpoonLab...');
      setImportProgress(5);

      const ingredients = await fetchAllPages(listIngredients, token, selectedCenterId);
      log(`  ${ingredients.length} ingredientes encontrados`);
      setImportProgress(20);

      // Fetch existing products to avoid duplicates (match by tspoonlab_ingredient_id or name)
      const existingProducts = await marginbites.entities.Product.filter({});
      const productsByTsId = {};
      const productsByName = {};
      existingProducts.forEach(p => {
        if (p.tspoonlab_ingredient_id) productsByTsId[p.tspoonlab_ingredient_id] = p;
        productsByName[p.product_name?.toLowerCase()] = p;
      });

      log('Importando ingredientes como productos...');
      let done = 0;
      for (const ing of ingredients) {
        try {
          const tsId = String(ing.id);
          const name = ing.descr || ing.name || `Ingrediente ${tsId}`;

          const payload = {
            product_name: name,
            sku: ing.codi || '',
            is_active: true,
            tspoonlab_ingredient_id: tsId,
            avg_price: ing.cost || ing.averageCost || 0,
          };

          if (productsByTsId[tsId]) {
            // Update existing
            await marginbites.entities.Product.update(productsByTsId[tsId].id, payload);
          } else if (productsByName[name.toLowerCase()]) {
            // Match by name → update
            await marginbites.entities.Product.update(productsByName[name.toLowerCase()].id, {
              ...payload,
              tspoonlab_ingredient_id: tsId,
            });
          } else {
            // Create new
            await marginbites.entities.Product.create(payload);
          }
          stats.products++;
        } catch (err) {
          console.error('Error importing ingredient', ing.id, err);
          stats.errors++;
        }
        done++;
        setImportProgress(20 + Math.round((done / ingredients.length) * 35));
      }
      log(`  ✓ ${stats.products} productos sincronizados`);

      // ── 2. Import intermediate recipes ──────────────────────────────────────

      log('Descargando elaboraciones intermedias...');
      setImportProgress(55);

      const recipes = await fetchAllPages(listRecipes, token, selectedCenterId);
      log(`  ${recipes.length} elaboraciones encontradas`);

      const existingRecipes = await marginbites.entities.Recipe.filter({});
      const recipesByTsId = {};
      existingRecipes.forEach(r => {
        if (r.tspoonlab_recipe_id) recipesByTsId[r.tspoonlab_recipe_id] = r;
      });

      log('Importando elaboraciones como recetas...');
      done = 0;
      for (const rec of recipes) {
        try {
          const tsId = String(rec.id);
          const name = rec.descr || `Receta ${tsId}`;
          const payload = {
            recipe_name: name,
            recipe_type: 'intermediate',
            is_active: true,
            tspoonlab_recipe_id: tsId,
          };
          if (recipesByTsId[tsId]) {
            await marginbites.entities.Recipe.update(recipesByTsId[tsId].id, payload);
          } else {
            await marginbites.entities.Recipe.create(payload);
          }
          stats.recipes++;
        } catch (err) {
          stats.errors++;
        }
        done++;
        setImportProgress(55 + Math.round((done / Math.max(recipes.length, 1)) * 20));
      }
      log(`  ✓ ${stats.recipes} recetas sincronizadas`);

      // ── 3. Import final dishes (as recipes type=final) ─────────────────────

      log('Descargando platos finales...');
      setImportProgress(75);

      const dishes = await fetchAllPages(listDishes, token, selectedCenterId);
      log(`  ${dishes.length} platos encontrados`);

      let dishesDone = 0;
      for (const dish of dishes) {
        try {
          const tsId = String(dish.id);
          const name = dish.descr || `Plato ${tsId}`;
          const payload = {
            recipe_name: name,
            recipe_type: 'final',
            is_active: true,
            tspoonlab_recipe_id: tsId,
          };
          if (recipesByTsId[tsId]) {
            await marginbites.entities.Recipe.update(recipesByTsId[tsId].id, payload);
          } else {
            await marginbites.entities.Recipe.create(payload);
          }
          stats.recipes++;
        } catch (err) {
          stats.errors++;
        }
        dishesDone++;
        setImportProgress(75 + Math.round((dishesDone / Math.max(dishes.length, 1)) * 20));
      }
      log(`  ✓ ${stats.recipes} recetas totales sincronizadas`);

      setImportProgress(100);
      setImportStats(stats);
      log('¡Importación completada!');
      setStep(STEPS.DONE);

    } catch (err) {
      console.error('Import error', err);
      log(`❌ Error: ${err.message}`);
      toast.error('Error durante la importación');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">

        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-2xl mb-4">
            <Link className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Importar desde tSpoonLab</h1>
          <p className="text-slate-500 mt-1">
            Sincroniza ingredientes y recetas con tu cuenta tSpoonLab
          </p>
        </div>

        {/* Step 1: Credentials */}
        {step === STEPS.CREDENTIALS && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Credenciales tSpoonLab</CardTitle>
              <CardDescription>El mismo usuario y contraseña que usas en app.tspoonlab.com</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleConnect} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Email</Label>
                  <Input
                    id="username"
                    type="email"
                    placeholder="tu@email.com"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={isLoading}>
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Conectar
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Select cost center */}
        {step === STEPS.SELECT_CENTER && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Seleccionar centro de coste</CardTitle>
              <CardDescription>¿Qué local quieres sincronizar?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {orderCenters.length === 0 ? (
                <p className="text-sm text-amber-600 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  No se encontraron centros de coste en tu cuenta
                </p>
              ) : (
                <div className="space-y-2">
                  <Label>Centro de coste</Label>
                  <Select value={selectedCenterId} onValueChange={setSelectedCenterId}>
                    <SelectTrigger>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-slate-400" />
                        <SelectValue placeholder="Selecciona..." />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {orderCenters.map(c => (
                        <SelectItem key={c.idOrderCenter} value={String(c.idOrderCenter)}>
                          {c.name || c.descr}{c.city ? ` — ${c.city}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* What will be imported */}
              <div className="bg-slate-50 rounded-lg p-3 space-y-2 text-sm">
                <p className="font-medium text-slate-700">Se importará:</p>
                <div className="flex items-center gap-2 text-slate-600">
                  <Package className="w-4 h-4 text-emerald-500" />
                  Ingredientes → Productos
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <ChefHat className="w-4 h-4 text-emerald-500" />
                  Elaboraciones y platos → Recetas
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep(STEPS.CREDENTIALS)} disabled={isLoading}>
                  Atrás
                </Button>
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleStartImport}
                  disabled={!selectedCenterId || isLoading}
                >
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Importar ahora
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Import in progress */}
        {step === STEPS.IMPORT && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Importando datos...</CardTitle>
              <CardDescription>No cierres esta ventana</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={importProgress} className="h-2" />
              <p className="text-sm text-slate-500 text-right">{importProgress}%</p>
              <div className="bg-slate-900 rounded-lg p-3 h-48 overflow-y-auto font-mono text-xs space-y-1">
                {importLog.map((line, i) => (
                  <p key={i} className={
                    line.startsWith('❌') ? 'text-red-400' :
                    line.startsWith('  ✓') ? 'text-emerald-400' :
                    'text-slate-300'
                  }>
                    {line}
                  </p>
                ))}
                {isLoading && (
                  <p className="text-slate-400 animate-pulse">▌</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Done */}
        {step === STEPS.DONE && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">¡Importación completada!</h2>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-center">
                    <div className="bg-emerald-50 rounded-lg p-3">
                      <p className="text-2xl font-bold text-emerald-700">{importStats.products}</p>
                      <p className="text-xs text-emerald-600">Productos</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3">
                      <p className="text-2xl font-bold text-blue-700">{importStats.recipes}</p>
                      <p className="text-xs text-blue-600">Recetas</p>
                    </div>
                  </div>
                  {importStats.errors > 0 && (
                    <p className="text-sm text-amber-600 mt-2">{importStats.errors} errores (ver consola)</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => navigate(createPageUrl('Dashboard'))}>
                    Ir al Dashboard
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => {
                    setStep(STEPS.CREDENTIALS);
                    setImportLog([]);
                    setImportProgress(0);
                  }}>
                    Volver a importar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}
