import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { marginbites } from '@/api/marginbitesClient';
import { login as tspoonLogin, getOrderCenters } from '@/api/tspoonlab';
import { Building2, Link, Loader2, CheckCircle2, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

const STEPS = { CREDENTIALS: 'credentials', SELECT_CENTER: 'select_center', DONE: 'done' };

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(STEPS.CREDENTIALS);
  const [isLoading, setIsLoading] = useState(false);

  // Credentials form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // After login
  const [token, setToken] = useState('');
  const [orderCenters, setOrderCenters] = useState([]);
  const [selectedCenterId, setSelectedCenterId] = useState('');

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
        // Only one cost center — auto-select it
        setSelectedCenterId(String(centers[0].idOrderCenter));
      }

      setStep(STEPS.SELECT_CENTER);
    } catch (err) {
      console.error(err);
      toast.error('No se pudo conectar a tSpoonLab. Verifica tus credenciales.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedCenterId) return;

    setIsLoading(true);
    try {
      const center = orderCenters.find(c => String(c.idOrderCenter) === selectedCenterId);

      // Persist in app_settings so other pages can use the integration
      const existing = await marginbites.entities.AppSetting.filter({ key: 'tspoonlab' });
      const payload = {
        key: 'tspoonlab',
        value: JSON.stringify({
          username,
          // NOTE: storing password in PocketBase is a trade-off.
          // For production: use a PocketBase hook / server-side proxy to store it encrypted.
          password,
          token,
          idOrderCenter: selectedCenterId,
          centerName: center?.name || center?.descr || selectedCenterId,
          connectedAt: new Date().toISOString(),
        }),
      };

      if (existing.length > 0) {
        await marginbites.entities.AppSetting.update(existing[0].id, payload);
      } else {
        await marginbites.entities.AppSetting.create(payload);
      }

      setStep(STEPS.DONE);
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar la configuración');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinish = () => {
    navigate(createPageUrl('Dashboard'));
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-2xl mb-4">
            <Link className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Conectar tSpoonLab</h1>
          <p className="text-slate-500 mt-1">
            Sincroniza tus recetas e ingredientes automáticamente
          </p>
        </div>

        {/* Step: Credentials */}
        {step === STEPS.CREDENTIALS && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tus credenciales</CardTitle>
              <CardDescription>
                Introduce el usuario y contraseña de tu cuenta tSpoonLab
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleConnect} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Usuario (email)</Label>
                  <Input
                    id="username"
                    type="email"
                    placeholder="tu@email.com"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                    autoComplete="email"
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
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={isLoading}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Conectar
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step: Select cost center */}
        {step === STEPS.SELECT_CENTER && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Seleccionar local</CardTitle>
              <CardDescription>
                Elige el centro de coste de tSpoonLab que quieres sincronizar
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Centro de coste</Label>
                {orderCenters.length === 0 ? (
                  <p className="text-sm text-slate-500">No se encontraron centros de coste</p>
                ) : (
                  <Select value={selectedCenterId} onValueChange={setSelectedCenterId}>
                    <SelectTrigger>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-slate-400" />
                        <SelectValue placeholder="Selecciona un centro" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {orderCenters.map(c => (
                        <SelectItem key={c.idOrderCenter} value={String(c.idOrderCenter)}>
                          {c.name || c.descr} {c.city ? `— ${c.city}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep(STEPS.CREDENTIALS)}
                  disabled={isLoading}
                >
                  Atrás
                </Button>
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleSave}
                  disabled={!selectedCenterId || isLoading}
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Guardar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Done */}
        {step === STEPS.DONE && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">¡Conectado!</h2>
                  <p className="text-slate-500 mt-1">
                    tSpoonLab se ha vinculado correctamente. Tus recetas e ingredientes
                    se sincronizarán automáticamente.
                  </p>
                </div>
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={handleFinish}>
                  Ir al Dashboard
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
