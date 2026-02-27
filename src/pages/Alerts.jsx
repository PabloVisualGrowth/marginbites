import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import {
  Bell, AlertTriangle, CheckCircle2, XCircle, Info,
  Loader2, Eye, Check, Trash2, Filter
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

const priorityConfig = {
  critical: { label: 'Crítica', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
  high: { label: 'Alta', color: 'bg-orange-100 text-orange-700 border-orange-200', icon: AlertTriangle },
  medium: { label: 'Media', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Info },
  low: { label: 'Baja', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Info },
};

export default function Alerts({ selectedLocationId }) {
  const queryClient = useQueryClient();
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('pending');

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', selectedLocationId, activeTab],
    queryFn: async () => {
      const filters = {};
      if (selectedLocationId) filters.location_id = selectedLocationId;
      if (activeTab === 'pending') filters.status = 'Pending';
      if (activeTab === 'read') filters.status = 'Read';
      return base44.entities.Notification.filter(filters, '-created_date', 100);
    }
  });

  const { data: systemErrors = [] } = useQuery({
    queryKey: ['systemErrors', 'open'],
    queryFn: async () => {
      return base44.entities.SystemError.filter({ status: 'Open' }, '-created_date', 20);
    }
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId) => {
      await base44.entities.Notification.update(notificationId, {
        status: 'Read',
        read_at: new Date().toISOString()
      });
    },
    onSuccess: () => {
      toast.success('Notificación marcada como leída');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const pending = notifications.filter(n => n.status === 'Pending');
      for (const n of pending) {
        await base44.entities.Notification.update(n.id, {
          status: 'Read',
          read_at: new Date().toISOString()
        });
      }
    },
    onSuccess: () => {
      toast.success('Todas las notificaciones marcadas como leídas');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const filteredNotifications = notifications.filter(n => {
    if (priorityFilter === 'all') return true;
    return n.priority === priorityFilter;
  });

  const pendingCount = notifications.filter(n => n.status === 'Pending').length;
  const criticalCount = notifications.filter(n => n.priority === 'critical' && n.status === 'Pending').length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Pendientes</p>
                <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
              </div>
              <Bell className="w-8 h-8 text-amber-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Críticas</p>
                <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
              </div>
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Errores Sistema</p>
                <p className="text-2xl font-bold text-purple-600">{systemErrors.length}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Hoy</p>
                <p className="text-2xl font-bold">{notifications.length}</p>
              </div>
              <Info className="w-8 h-8 text-slate-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <TabsList>
            <TabsTrigger value="pending" className="gap-2">
              <Bell className="w-4 h-4" />
              Pendientes
              {pendingCount > 0 && (
                <Badge className="ml-1 bg-red-500 text-white">{pendingCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="read" className="gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Leídas
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-2">
              Todas
            </TabsTrigger>
          </TabsList>

          <div className="flex gap-2">
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-40">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Prioridad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="critical">Críticas</SelectItem>
                <SelectItem value="high">Altas</SelectItem>
                <SelectItem value="medium">Medias</SelectItem>
                <SelectItem value="low">Bajas</SelectItem>
              </SelectContent>
            </Select>
            {activeTab === 'pending' && pendingCount > 0 && (
              <Button 
                variant="outline"
                onClick={() => markAllAsReadMutation.mutate()}
                disabled={markAllAsReadMutation.isPending}
              >
                Marcar todas como leídas
              </Button>
            )}
          </div>
        </div>

        <TabsContent value={activeTab} className="mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : filteredNotifications.length === 0 ? (
            <Card>
              <CardContent className="py-20 text-center">
                <CheckCircle2 className="w-16 h-16 mx-auto text-emerald-500 mb-4" />
                <h3 className="text-lg font-medium text-slate-700 mb-2">
                  {activeTab === 'pending' ? 'No hay alertas pendientes' : 'No hay notificaciones'}
                </h3>
                <p className="text-slate-500">
                  {activeTab === 'pending' 
                    ? 'Todas las alertas han sido atendidas' 
                    : 'No se encontraron notificaciones con los filtros seleccionados'
                  }
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredNotifications.map(notification => {
                const priority = priorityConfig[notification.priority] || priorityConfig.medium;
                const PriorityIcon = priority.icon;
                return (
                  <Card key={notification.id} className={`border-l-4 ${
                    notification.priority === 'critical' ? 'border-l-red-500' :
                    notification.priority === 'high' ? 'border-l-orange-500' :
                    notification.priority === 'medium' ? 'border-l-amber-500' :
                    'border-l-blue-500'
                  }`}>
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg ${
                            notification.priority === 'critical' ? 'bg-red-100' :
                            notification.priority === 'high' ? 'bg-orange-100' :
                            notification.priority === 'medium' ? 'bg-amber-100' :
                            'bg-blue-100'
                          }`}>
                            <PriorityIcon className={`w-5 h-5 ${
                              notification.priority === 'critical' ? 'text-red-600' :
                              notification.priority === 'high' ? 'text-orange-600' :
                              notification.priority === 'medium' ? 'text-amber-600' :
                              'text-blue-600'
                            }`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{notification.title}</h4>
                              <Badge className={priority.color}>
                                {priority.label}
                              </Badge>
                              {notification.status === 'Read' && (
                                <Badge variant="outline" className="text-slate-500">
                                  Leída
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-slate-600 mt-1">{notification.message}</p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                              <span>
                                {notification.created_date && format(new Date(notification.created_date), 'dd/MM/yyyy HH:mm')}
                              </span>
                              {notification.related_entity_type && (
                                <span className="capitalize">
                                  {notification.related_entity_type}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {notification.status === 'Pending' && (
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => markAsReadMutation.mutate(notification.id)}
                              disabled={markAsReadMutation.isPending}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* System Errors Section */}
      {systemErrors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Errores del Sistema
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {systemErrors.slice(0, 5).map(error => (
                <div key={error.id} className="p-3 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-red-800">{error.function_name || error.workflow_name}</p>
                      <p className="text-sm text-red-600 mt-1">{error.error_message}</p>
                      <p className="text-xs text-red-500 mt-2">
                        {error.created_date && format(new Date(error.created_date), 'dd/MM/yyyy HH:mm')}
                      </p>
                    </div>
                    <Badge className="bg-red-100 text-red-700">
                      {error.severity}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}