import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Database,
  Server, RefreshCw, Loader2, XCircle, History
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function Monitoring({ user }) {
  const { data: systemErrors = [], isLoading: loadingErrors } = useQuery({
    queryKey: ['systemErrors'],
    queryFn: () => base44.entities.SystemError.list('-created_date', 20),
  });

  const { data: auditLogs = [], isLoading: loadingAudit } = useQuery({
    queryKey: ['auditLogs'],
    queryFn: () => base44.entities.AuditLog.list('-created_date', 50),
  });

  const { data: syncStates = [] } = useQuery({
    queryKey: ['syncStates'],
    queryFn: () => base44.entities.IntegrationSyncState.list('-updated_at', 20),
  });

  const { data: grns = [] } = useQuery({
    queryKey: ['grnsToday'],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      return base44.entities.GRN.filter({ delivery_date: today });
    },
  });

  const { data: inventories = [] } = useQuery({
    queryKey: ['inventoriesThisWeek'],
    queryFn: () => base44.entities.Inventory.list('-started_at', 10),
  });

  if (user?.role !== 'admin') {
    return (
      <Card>
        <CardContent className="py-20 text-center">
          <Activity className="w-16 h-16 mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-700 mb-2">Acceso Restringido</h3>
          <p className="text-slate-500">Solo administradores pueden acceder a la monitorización</p>
        </CardContent>
      </Card>
    );
  }

  const openErrors = systemErrors.filter(e => e.status === 'Open');
  const criticalErrors = openErrors.filter(e => e.severity === 'critical' || e.severity === 'high');

  return (
    <div className="space-y-6">
      {/* Health Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Estado General</p>
                <p className={`text-2xl font-bold ${criticalErrors.length > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {criticalErrors.length > 0 ? 'Con Alertas' : 'Saludable'}
                </p>
              </div>
              {criticalErrors.length > 0 ? (
                <XCircle className="w-8 h-8 text-red-600" />
              ) : (
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Errores Abiertos</p>
                <p className="text-2xl font-bold text-red-600">{openErrors.length}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">GRNs Hoy</p>
                <p className="text-2xl font-bold">{grns.length}</p>
              </div>
              <Database className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Integraciones</p>
                <p className="text-2xl font-bold text-emerald-600">{syncStates.length} activas</p>
              </div>
              <Server className="w-8 h-8 text-emerald-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Errors */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Errores del Sistema
            </CardTitle>
            <CardDescription>Últimos errores registrados</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingErrors ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : systemErrors.length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-2" />
                <p>No hay errores registrados</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {systemErrors.map(error => (
                  <div 
                    key={error.id} 
                    className={`p-3 rounded-lg border ${
                      error.status === 'Open' 
                        ? 'bg-red-50 border-red-200' 
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-sm">
                          {error.function_name || error.workflow_name}
                        </p>
                        <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                          {error.error_message}
                        </p>
                        <p className="text-xs text-slate-400 mt-2">
                          {error.created_date && format(new Date(error.created_date), 'dd/MM/yyyy HH:mm')}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge className={
                          error.severity === 'critical' ? 'bg-red-100 text-red-700' :
                          error.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                          error.severity === 'medium' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-700'
                        }>
                          {error.severity}
                        </Badge>
                        <Badge variant="outline" className={
                          error.status === 'Open' ? 'text-red-600' : 'text-emerald-600'
                        }>
                          {error.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Integration Sync Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-blue-600" />
              Estado de Sincronización
            </CardTitle>
            <CardDescription>Estado de las integraciones</CardDescription>
          </CardHeader>
          <CardContent>
            {syncStates.length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                <Server className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                <p>No hay integraciones configuradas</p>
              </div>
            ) : (
              <div className="space-y-3">
                {syncStates.map(sync => (
                  <div key={sync.id} className="p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm capitalize">
                          {sync.integration_type?.replace('_', ' ')}
                        </p>
                        <p className="text-xs text-slate-500">{sync.key}</p>
                      </div>
                      <div className="text-right">
                        <Badge className={
                          sync.last_sync_status === 'success' ? 'bg-emerald-100 text-emerald-700' :
                          sync.last_sync_status === 'error' ? 'bg-red-100 text-red-700' :
                          'bg-amber-100 text-amber-700'
                        }>
                          {sync.last_sync_status || 'pending'}
                        </Badge>
                        {sync.last_sync_at && (
                          <p className="text-xs text-slate-400 mt-1">
                            {format(new Date(sync.last_sync_at), 'dd/MM HH:mm')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Audit Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-purple-600" />
            Registro de Auditoría
          </CardTitle>
          <CardDescription>Últimas acciones del sistema</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Entidad</TableHead>
                  <TableHead>Descripción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingAudit ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                    </TableCell>
                  </TableRow>
                ) : auditLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-slate-500">
                      No hay registros de auditoría
                    </TableCell>
                  </TableRow>
                ) : (
                  auditLogs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm">
                        {log.created_date && format(new Date(log.created_date), 'dd/MM/yyyy HH:mm')}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{log.actor_name || 'Sistema'}</p>
                          <p className="text-xs text-slate-500">{log.actor_email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {log.action_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{log.entity_type}</span>
                        {log.entity_number && (
                          <span className="text-xs text-slate-500 ml-1">
                            ({log.entity_number})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600 max-w-xs truncate">
                        {log.description || '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}