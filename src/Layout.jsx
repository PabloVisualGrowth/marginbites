import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { marginbites } from '@/api/marginbitesClient';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { 
  LayoutDashboard, ShoppingCart, Package, Warehouse, 
  ChefHat, ClipboardList, TrendingDown, Bell, Settings, 
  Activity, Menu, X, ChevronDown, LogOut, User,
  Building2, AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const location = useLocation();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => marginbites.auth.me(),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => marginbites.entities.Location.list(),
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => marginbites.entities.Notification.filter({ status: 'Pending' }, '-created_date', 10),
  });

  const unreadCount = notifications.length;

  useEffect(() => {
    if (locations.length > 0 && !selectedLocationId) {
      const defaultLoc = user?.preferences?.default_location_id || locations[0]?.id;
      setSelectedLocationId(defaultLoc);
    }
  }, [locations, user, selectedLocationId]);

  const selectedLocation = locations.find(l => l.id === selectedLocationId);

  const handleLogout = () => {
    marginbites.auth.logout();
  };

  const userRole = user?.role || 'chef';
  const canAccessConfig = ['admin', 'manager'].includes(userRole);
  const canAccessMonitor = userRole === 'admin';

  const navigation = [
    { name: 'Dashboard', href: 'Dashboard', icon: LayoutDashboard, roles: ['chef', 'encargado', 'manager', 'admin'] },
    { name: 'Pedidos', href: 'PurchaseOrders', icon: ShoppingCart, roles: ['chef', 'encargado', 'manager', 'admin'] },
    { name: 'Recepciones', href: 'GRNList', icon: Package, roles: ['chef', 'encargado', 'manager', 'admin'] },
    { name: 'Stock', href: 'Stock', icon: Warehouse, roles: ['chef', 'encargado', 'manager', 'admin'] },
    { name: 'Ventas y Recetas', href: 'SalesRecipes', icon: ChefHat, roles: ['encargado', 'manager', 'admin'] },
    { name: 'Inventarios', href: 'Inventories', icon: ClipboardList, roles: ['encargado', 'manager', 'admin'] },
    { name: 'Panel Sangrado', href: 'BleedPanel', icon: TrendingDown, roles: ['manager', 'admin'] },
    { name: 'Alertas', href: 'Alerts', icon: Bell, roles: ['chef', 'encargado', 'manager', 'admin'] },
    { name: 'Configuración', href: 'Settings', icon: Settings, roles: ['manager', 'admin'] },
    { name: 'Monitorización', href: 'Monitoring', icon: Activity, roles: ['admin'] },
  ];

  const filteredNav = navigation.filter(item => item.roles.includes(userRole));

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 z-50 h-full w-64 bg-slate-900 transform transition-transform duration-200 ease-in-out lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800">
            <Link to={createPageUrl('Dashboard')} className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-lg flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-white">Marginbites</span>
            </Link>
            <Button 
              variant="ghost" 
              size="icon" 
              className="lg:hidden text-slate-400"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Location Selector */}
          {locations.length > 0 && (
            <div className="px-3 py-4 border-b border-slate-800">
              <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <SelectValue placeholder="Seleccionar local" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {locations.map(loc => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {filteredNav.map((item) => {
              const isActive = currentPageName === item.href;
              return (
                <Link
                  key={item.name}
                  to={createPageUrl(item.href)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive 
                      ? "bg-emerald-600 text-white" 
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className="w-5 h-5" />
                  {item.name}
                  {item.name === 'Alertas' && unreadCount > 0 && (
                    <Badge className="ml-auto bg-red-500 text-white text-xs">
                      {unreadCount}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User section */}
          <div className="p-3 border-t border-slate-800">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-slate-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {user?.full_name || 'Usuario'}
                </p>
                <p className="text-xs text-slate-400 capitalize">{userRole}</p>
              </div>
              <Button 
                variant="ghost" 
                size="icon"
                className="text-slate-400 hover:text-white"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top header */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
          <div className="flex items-center justify-between h-16 px-4">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-lg font-semibold text-slate-900">
                  {currentPageName === 'Dashboard' && 'Dashboard'}
                  {currentPageName === 'PurchaseOrders' && 'Pedidos a Proveedores'}
                  {currentPageName === 'GRNList' && 'Recepciones de Mercancía'}
                  {currentPageName === 'Stock' && 'Control de Stock'}
                  {currentPageName === 'SalesRecipes' && 'Ventas y Recetas'}
                  {currentPageName === 'Inventories' && 'Inventarios'}
                  {currentPageName === 'BleedPanel' && 'Panel de Sangrado'}
                  {currentPageName === 'Alerts' && 'Alertas y Notificaciones'}
                  {currentPageName === 'Settings' && 'Configuración'}
                  {currentPageName === 'Monitoring' && 'Monitorización'}
                </h1>
                {selectedLocation && (
                  <p className="text-sm text-slate-500">{selectedLocation.name}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Notifications */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                        {unreadCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuLabel>Notificaciones</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-sm text-slate-500">
                      No hay notificaciones pendientes
                    </div>
                  ) : (
                    notifications.slice(0, 5).map(notif => (
                      <DropdownMenuItem key={notif.id} className="flex flex-col items-start gap-1 p-3">
                        <div className="flex items-center gap-2">
                          {notif.priority === 'critical' && <AlertTriangle className="w-4 h-4 text-red-500" />}
                          {notif.priority === 'high' && <AlertTriangle className="w-4 h-4 text-orange-500" />}
                          <span className="font-medium text-sm">{notif.title}</span>
                        </div>
                        <span className="text-xs text-slate-500 line-clamp-2">{notif.message}</span>
                      </DropdownMenuItem>
                    ))
                  )}
                  {notifications.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link to={createPageUrl('Alerts')} className="w-full text-center text-emerald-600">
                          Ver todas
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* User menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-slate-600" />
                    </div>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>
                    <div>
                      <p className="font-medium">{user?.full_name}</p>
                      <p className="text-xs text-slate-500">{user?.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Cerrar sesión
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          {React.cloneElement(children, { selectedLocationId, selectedLocation, user, locations })}
        </main>
      </div>
    </div>
  );
}