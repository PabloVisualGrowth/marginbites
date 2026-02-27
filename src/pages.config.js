/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Dashboard from './pages/Dashboard';
import PurchaseOrders from './pages/PurchaseOrders';
import GRNList from './pages/GRNList';
import Stock from './pages/Stock';
import BleedPanel from './pages/BleedPanel';
import Inventories from './pages/Inventories';
import Alerts from './pages/Alerts';
import Settings from './pages/Settings';
import SalesRecipes from './pages/SalesRecipes';
import Monitoring from './pages/Monitoring';
import GRNDetail from './pages/GRNDetail';
import InventoryDetail from './pages/InventoryDetail';
import PODetail from './pages/PODetail';
import PONew from './pages/PONew';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "PurchaseOrders": PurchaseOrders,
    "GRNList": GRNList,
    "Stock": Stock,
    "BleedPanel": BleedPanel,
    "Inventories": Inventories,
    "Alerts": Alerts,
    "Settings": Settings,
    "SalesRecipes": SalesRecipes,
    "Monitoring": Monitoring,
    "GRNDetail": GRNDetail,
    "InventoryDetail": InventoryDetail,
    "PODetail": PODetail,
    "PONew": PONew,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};