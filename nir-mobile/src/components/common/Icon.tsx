import React from 'react';
import { I18nManager, type ViewStyle } from 'react-native';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  Bird,
  Building2,
  Calendar,
  CalendarCheck,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  CircleDot,
  ClipboardCheck,
  ClipboardList,
  Download,
  Factory,
  Feather,
  FileText,
  Filter,
  Flag,
  Gauge,
  HandCoins,
  Inbox,
  Clock,
  Info,
  KeyRound,
  Layers,
  LayoutDashboard,
  LineChart,
  Lock,
  MapPin,
  Menu,
  Package,
  PackageCheck,
  Pencil,
  Percent,
  Phone,
  PlusCircle,
  RefreshCw,
  Route,
  Scale,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Signature,
  Sparkles,
  Sun,
  Timer,
  TrendingDown,
  TrendingUp,
  Truck,
  TriangleAlert,
  User,
  UserRound,
  Wallet,
  Warehouse,
  Wheat,
  Weight,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { palette } from '../../theme/tokens';

/**
 * The exact icon set used by the navigation shells and shared chrome. Keeping it closed means a
 * typo becomes a compile error instead of an invisible blank square at runtime.
 *
 * `factory` is used by the manager's inventory tab because it genuinely means "the plant's silos".
 */
export const APP_ICONS = {
  farmerDashboard: LayoutDashboard,
  farmerOrders: Package,
  farmerInvoices: Scale,
  managerKpi: TrendingUp,
  managerRemittances: ClipboardList,
  managerWeighbridge: Scale,
  managerInventory: Factory,
  managerMore: Menu,
  operatorQuickRemittance: FileText,
  operatorWeighbridge: Scale,
  back: ChevronLeft,
  backRtl: ChevronRight,
  forward: ArrowRight,
  forwardRtl: ArrowLeft,
  error: TriangleAlert,
  empty: Inbox,
  calendar: Calendar,
  calendarCheck: CalendarCheck,
  calendarDays: CalendarDays,
  check: Check,
  close: X,
  flag: Flag,
  gear: Settings,
  pencil: Pencil,
  scaleGlyph: Scale,
  shieldCheck: ShieldCheck,

  /* ---- v2: role & domain vocabulary ------------------------------------------------------------
   * Added with the redesigned screens. `wheat` and `bird` replaced emoji that were previously
   * rendering as coloured glyphs inside metric cards, so flock/feed concepts now share the same
   * monochrome line weight as every other icon in the product.
   */
  phone: Phone,
  user: User,
  userRound: UserRound,
  lock: Lock,
  keyRound: KeyRound,
  send: Send,
  truck: Truck,
  warehouse: Warehouse,
  factoryAlt: Building2,
  gauge: Gauge,
  clock: Clock,
  timer: Timer,
  calendarPlus: PlusCircle,
  bell: Bell,
  wallet: Wallet,
  handCoins: HandCoins,
  clipboardCheck: ClipboardCheck,
  packageCheck: PackageCheck,
  route: Route,
  mapPin: MapPin,
  camera: Camera,
  signature: Signature,
  bird: Bird,
  wheat: Wheat,
  weight: Weight,
  activity: Activity,
  barChart: BarChart3,
  lineChart: LineChart,
  trendingUp: TrendingUp,
  trendingDown: TrendingDown,
  percent: Percent,
  sun: Sun,
  layers: Layers,
  sparkles: Sparkles,
  filter: Filter,
  search: Search,
  download: Download,
  refresh: RefreshCw,
  info: Info,
  checkCircle: CircleCheck,
  alertCircle: CircleAlert,
  dot: CircleDot,
  chevronDown: ChevronDown,
  chevronUp: ChevronUp,
  feather: Feather,
} as const;

export type AppIconName = keyof typeof APP_ICONS;

/**
 * Icons whose meaning depends on reading direction.
 *
 * In an RTL layout "back" must point right, so these are swapped by COMPONENT rather than flipped
 * with `scaleX: -1`. Component swapping avoids the Android rendering artefacts that a negative
 * scale produces on vector paths, and it stays correct if the app is later switched to LTR.
 *
 * Everything else here is symbolic, not directional — Scale, Package, Factory, Menu,
 * LayoutDashboard, ClipboardList, FileText and TrendingUp are never mirrored, because flipping
 * them would misrepresent the symbol rather than translate it.
 */
const MIRRORED_IN_RTL: Partial<Record<AppIconName, AppIconName>> = {
  back: 'backRtl',
  forward: 'forwardRtl',
};

const resolveName = (name: AppIconName): AppIconName =>
  I18nManager.isRTL ? MIRRORED_IN_RTL[name] ?? name : name;

export interface IconProps {
  name: AppIconName;
  /** Icon edge length in px. Defaults to 20 (inline); tab bars pass 22 explicitly. */
  size?: number;
  /** Any valid colour. Defaults to token ink, so an icon is never accidentally invisible. */
  color?: string;
  /**
   * Supply this when the icon IS the only label of a control (icon-only button, tab bar item).
   * It is then announced instead of being skipped as decoration.
   */
  accessibilityLabel?: string;
  /**
   * True when the icon is purely ornamental beside real text — it is then hidden from screen
   * readers rather than announced a second time.
   */
  decorative?: boolean;
  style?: ViewStyle;
  testID?: string;
}

/**
 * Single entry point for every UI glyph. Defaults are token-driven so size and colour stop being
 * re-invented on every screen.
 */
export function Icon({
  name,
  size = 20,
  color = palette.ink,
  accessibilityLabel,
  decorative = false,
  style,
  testID,
}: IconProps) {
  const Glyph: LucideIcon = APP_ICONS[resolveName(name)];

  const isHiddenFromReader = decorative && !accessibilityLabel;

  return (
    <Glyph
      size={size}
      color={color}
      style={style}
      testID={testID}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={isHiddenFromReader}
      importantForAccessibility={isHiddenFromReader ? 'no-hide-descendants' : 'auto'}
    />
  );
}

export default Icon;