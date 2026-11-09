import { forwardRef } from 'react';
import { HugeiconsIcon, type HugeiconsProps, type IconSvgElement } from '@hugeicons/react';
import {
  Activity01Icon,
  Add01Icon,
  AddSquareIcon,
  Alert02Icon,
  AlertCircleIcon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowLeft02Icon,
  ArrowRight01Icon,
  ArrowRight02Icon,
  ArrowUp01Icon,
  ArrowUpRight01Icon,
  Award01Icon,
  BicycleIcon,
  BookOpen01Icon,
  Calendar03Icon,
  Call02Icon,
  Cancel01Icon,
  CancelCircleIcon,
  CarrotIcon,
  ChartBarLineIcon,
  ChartDecreaseIcon,
  ChartHistogramIcon,
  ChartIncreaseIcon,
  CheckmarkBadge02Icon,
  CheckmarkCircle02Icon,
  ChefHatIcon,
  CircleIcon,
  ClipboardIcon,
  Clock01Icon,
  Copy01Icon,
  CreditCardIcon,
  CrownIcon,
  DashboardSquare01Icon,
  Delete02Icon,
  DeliveryTruck01Icon,
  Download01Icon,
  DragDropVerticalIcon,
  DropletIcon,
  Facebook01Icon,
  FavouriteIcon,
  File01Icon,
  FilterIcon,
  FireIcon,
  FlashIcon,
  FloppyDiskIcon,
  FolderTreeIcon,
  GiftIcon,
  GlobeIcon,
  GrapesIcon,
  HelpCircleIcon,
  Home01Icon,
  ImageAdd01Icon,
  InformationCircleIcon,
  InstagramIcon,
  Invoice01Icon,
  Key01Icon,
  Layers01Icon,
  Leaf01Icon,
  LinkSquare02Icon,
  Loading03Icon,
  Location01Icon,
  LockIcon,
  Logout01Icon,
  Mail01Icon,
  MailRemove01Icon,
  MailValidation01Icon,
  MedalFirstPlaceIcon,
  Megaphone01Icon,
  Menu01Icon,
  MergeIcon,
  Message01Icon,
  Message02Icon,
  MinusSignIcon,
  Money03Icon,
  MoreHorizontalIcon,
  Notification01Icon,
  PackageIcon,
  PauseCircleIcon,
  PauseIcon,
  PencilEdit01Icon,
  PencilEdit02Icon,
  PlayCircleIcon,
  PlayIcon,
  PrinterIcon,
  RefreshIcon,
  RepeatIcon,
  Restaurant01Icon,
  RotateLeft01Icon,
  Search01Icon,
  SecurityCheckIcon,
  SentIcon,
  Settings01Icon,
  Settings02Icon,
  Share01Icon,
  Shield01Icon,
  Shield02Icon,
  ShoppingBag01Icon,
  ShoppingCart01Icon,
  SidebarLeftIcon,
  SlidersHorizontalIcon,
  SmartPhone01Icon,
  SpoonAndForkIcon,
  StarIcon,
  SteakIcon,
  StethoscopeIcon,
  Store01Icon,
  Tag01Icon,
  Target02Icon,
  Tick02Icon,
  Ticket01Icon,
  TimeScheduleIcon,
  ToggleOffIcon,
  ToggleOnIcon,
  UserCheck01Icon,
  UserCircleIcon,
  UserGroupIcon,
  UserIcon,
  UserRemove01Icon,
  Video01Icon,
  ViewIcon,
  ViewOffIcon,
  WarehouseIcon,
  WeightScale01Icon,
  WheatIcon,
} from '@hugeicons/core-free-icons';

// Jeu d'icônes unique du site : Hugeicons (trait arrondi, 1,5 px), comme le portfolio.
// Les noms exportés restent ceux de l'ancienne bibliothèque : les pages changent seulement leur import.
export type IconProps = Omit<HugeiconsProps, 'icon' | 'altIcon' | 'showAlt'>;

const creer = (definition: IconSvgElement, nom: string) => {
  const Icone = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
    <HugeiconsIcon ref={ref} icon={definition} strokeWidth={1.5} aria-hidden={props['aria-label'] ? undefined : true} {...props} />
  ));
  Icone.displayName = nom;
  return Icone;
};

export const Activity = /*#__PURE__*/ creer(Activity01Icon, 'Activity');
export const AlertCircle = /*#__PURE__*/ creer(AlertCircleIcon, 'AlertCircle');
export const AlertTriangle = /*#__PURE__*/ creer(Alert02Icon, 'AlertTriangle');
export const ArrowLeft = /*#__PURE__*/ creer(ArrowLeft02Icon, 'ArrowLeft');
export const ArrowRight = /*#__PURE__*/ creer(ArrowRight02Icon, 'ArrowRight');
export const ArrowUpRight = /*#__PURE__*/ creer(ArrowUpRight01Icon, 'ArrowUpRight');
export const Award = /*#__PURE__*/ creer(Award01Icon, 'Award');
export const BadgeCheck = /*#__PURE__*/ creer(CheckmarkBadge02Icon, 'BadgeCheck');
export const Ban = /*#__PURE__*/ creer(CancelCircleIcon, 'Ban');
export const Banknote = /*#__PURE__*/ creer(Money03Icon, 'Banknote');
export const BarChart2 = /*#__PURE__*/ creer(ChartBarLineIcon, 'BarChart2');
export const BarChart3 = /*#__PURE__*/ creer(ChartHistogramIcon, 'BarChart3');
export const Beef = /*#__PURE__*/ creer(SteakIcon, 'Beef');
export const Bell = /*#__PURE__*/ creer(Notification01Icon, 'Bell');
export const Bike = /*#__PURE__*/ creer(BicycleIcon, 'Bike');
export const BookOpen = /*#__PURE__*/ creer(BookOpen01Icon, 'BookOpen');
export const Calendar = /*#__PURE__*/ creer(Calendar03Icon, 'Calendar');
export const CalendarDays = /*#__PURE__*/ creer(Calendar03Icon, 'CalendarDays');
export const Carrot = /*#__PURE__*/ creer(CarrotIcon, 'Carrot');
export const Check = /*#__PURE__*/ creer(Tick02Icon, 'Check');
export const CheckCircle = /*#__PURE__*/ creer(CheckmarkCircle02Icon, 'CheckCircle');
export const CheckCircle2 = /*#__PURE__*/ creer(CheckmarkCircle02Icon, 'CheckCircle2');
export const ChefHat = /*#__PURE__*/ creer(ChefHatIcon, 'ChefHat');
export const ChevronDown = /*#__PURE__*/ creer(ArrowDown01Icon, 'ChevronDown');
export const ChevronLeft = /*#__PURE__*/ creer(ArrowLeft01Icon, 'ChevronLeft');
export const ChevronRight = /*#__PURE__*/ creer(ArrowRight01Icon, 'ChevronRight');
export const ChevronUp = /*#__PURE__*/ creer(ArrowUp01Icon, 'ChevronUp');
export const Circle = /*#__PURE__*/ creer(CircleIcon, 'Circle');
export const CircleUser = /*#__PURE__*/ creer(UserCircleIcon, 'CircleUser');
export const ClipboardList = /*#__PURE__*/ creer(ClipboardIcon, 'ClipboardList');
export const Clock = /*#__PURE__*/ creer(Clock01Icon, 'Clock');
export const Copy = /*#__PURE__*/ creer(Copy01Icon, 'Copy');
export const CreditCard = /*#__PURE__*/ creer(CreditCardIcon, 'CreditCard');
export const Crown = /*#__PURE__*/ creer(CrownIcon, 'Crown');
export const Download = /*#__PURE__*/ creer(Download01Icon, 'Download');
export const Droplets = /*#__PURE__*/ creer(DropletIcon, 'Droplets');
export const Edit2 = /*#__PURE__*/ creer(PencilEdit02Icon, 'Edit2');
export const Edit3 = /*#__PURE__*/ creer(PencilEdit01Icon, 'Edit3');
export const ExternalLink = /*#__PURE__*/ creer(LinkSquare02Icon, 'ExternalLink');
export const Eye = /*#__PURE__*/ creer(ViewIcon, 'Eye');
export const EyeOff = /*#__PURE__*/ creer(ViewOffIcon, 'EyeOff');
export const Facebook = /*#__PURE__*/ creer(Facebook01Icon, 'Facebook');
export const FileText = /*#__PURE__*/ creer(File01Icon, 'FileText');
export const Film = /*#__PURE__*/ creer(Video01Icon, 'Film');
export const Filter = /*#__PURE__*/ creer(FilterIcon, 'Filter');
export const Flame = /*#__PURE__*/ creer(FireIcon, 'Flame');
export const FolderTree = /*#__PURE__*/ creer(FolderTreeIcon, 'FolderTree');
export const Gift = /*#__PURE__*/ creer(GiftIcon, 'Gift');
export const Globe = /*#__PURE__*/ creer(GlobeIcon, 'Globe');
export const Grape = /*#__PURE__*/ creer(GrapesIcon, 'Grape');
export const GripVertical = /*#__PURE__*/ creer(DragDropVerticalIcon, 'GripVertical');
export const Heart = /*#__PURE__*/ creer(FavouriteIcon, 'Heart');
export const HelpCircle = /*#__PURE__*/ creer(HelpCircleIcon, 'HelpCircle');
export const History = /*#__PURE__*/ creer(TimeScheduleIcon, 'History');
export const Home = /*#__PURE__*/ creer(Home01Icon, 'Home');
export const ImagePlus = /*#__PURE__*/ creer(ImageAdd01Icon, 'ImagePlus');
export const Info = /*#__PURE__*/ creer(InformationCircleIcon, 'Info');
export const Instagram = /*#__PURE__*/ creer(InstagramIcon, 'Instagram');
export const KeyRound = /*#__PURE__*/ creer(Key01Icon, 'KeyRound');
export const Layers = /*#__PURE__*/ creer(Layers01Icon, 'Layers');
export const LayoutDashboard = /*#__PURE__*/ creer(DashboardSquare01Icon, 'LayoutDashboard');
export const Leaf = /*#__PURE__*/ creer(Leaf01Icon, 'Leaf');
export const Loader2 = /*#__PURE__*/ creer(Loading03Icon, 'Loader2');
export const Lock = /*#__PURE__*/ creer(LockIcon, 'Lock');
export const LogOut = /*#__PURE__*/ creer(Logout01Icon, 'LogOut');
export const Mail = /*#__PURE__*/ creer(Mail01Icon, 'Mail');
export const MailCheck = /*#__PURE__*/ creer(MailValidation01Icon, 'MailCheck');
export const MailX = /*#__PURE__*/ creer(MailRemove01Icon, 'MailX');
export const MapPin = /*#__PURE__*/ creer(Location01Icon, 'MapPin');
export const Medal = /*#__PURE__*/ creer(MedalFirstPlaceIcon, 'Medal');
export const Megaphone = /*#__PURE__*/ creer(Megaphone01Icon, 'Megaphone');
export const Menu = /*#__PURE__*/ creer(Menu01Icon, 'Menu');
export const Merge = /*#__PURE__*/ creer(MergeIcon, 'Merge');
export const MessageCircle = /*#__PURE__*/ creer(Message01Icon, 'MessageCircle');
export const MessageSquare = /*#__PURE__*/ creer(Message02Icon, 'MessageSquare');
export const Minus = /*#__PURE__*/ creer(MinusSignIcon, 'Minus');
export const MoreHorizontal = /*#__PURE__*/ creer(MoreHorizontalIcon, 'MoreHorizontal');
export const Package = /*#__PURE__*/ creer(PackageIcon, 'Package');
export const PanelLeft = /*#__PURE__*/ creer(SidebarLeftIcon, 'PanelLeft');
export const Pause = /*#__PURE__*/ creer(PauseIcon, 'Pause');
export const PauseCircle = /*#__PURE__*/ creer(PauseCircleIcon, 'PauseCircle');
export const Phone = /*#__PURE__*/ creer(Call02Icon, 'Phone');
export const Play = /*#__PURE__*/ creer(PlayIcon, 'Play');
export const PlayCircle = /*#__PURE__*/ creer(PlayCircleIcon, 'PlayCircle');
export const Plus = /*#__PURE__*/ creer(Add01Icon, 'Plus');
export const Printer = /*#__PURE__*/ creer(PrinterIcon, 'Printer');
export const Receipt = /*#__PURE__*/ creer(Invoice01Icon, 'Receipt');
export const RefreshCcw = /*#__PURE__*/ creer(RefreshIcon, 'RefreshCcw');
export const RefreshCw = /*#__PURE__*/ creer(RefreshIcon, 'RefreshCw');
export const Repeat = /*#__PURE__*/ creer(RepeatIcon, 'Repeat');
export const RotateCcw = /*#__PURE__*/ creer(RotateLeft01Icon, 'RotateCcw');
export const Save = /*#__PURE__*/ creer(FloppyDiskIcon, 'Save');
export const Scale = /*#__PURE__*/ creer(WeightScale01Icon, 'Scale');
export const Search = /*#__PURE__*/ creer(Search01Icon, 'Search');
export const Send = /*#__PURE__*/ creer(SentIcon, 'Send');
export const Settings = /*#__PURE__*/ creer(Settings01Icon, 'Settings');
export const Settings2 = /*#__PURE__*/ creer(Settings02Icon, 'Settings2');
export const Share = /*#__PURE__*/ creer(Share01Icon, 'Share');
export const Shield = /*#__PURE__*/ creer(Shield01Icon, 'Shield');
export const ShieldAlert = /*#__PURE__*/ creer(Shield02Icon, 'ShieldAlert');
export const ShieldCheck = /*#__PURE__*/ creer(SecurityCheckIcon, 'ShieldCheck');
export const ShoppingBag = /*#__PURE__*/ creer(ShoppingBag01Icon, 'ShoppingBag');
export const ShoppingCart = /*#__PURE__*/ creer(ShoppingCart01Icon, 'ShoppingCart');
export const SlidersHorizontal = /*#__PURE__*/ creer(SlidersHorizontalIcon, 'SlidersHorizontal');
export const Smartphone = /*#__PURE__*/ creer(SmartPhone01Icon, 'Smartphone');
export const SquarePlus = /*#__PURE__*/ creer(AddSquareIcon, 'SquarePlus');
export const Star = /*#__PURE__*/ creer(StarIcon, 'Star');
export const Stethoscope = /*#__PURE__*/ creer(StethoscopeIcon, 'Stethoscope');
export const Store = /*#__PURE__*/ creer(Store01Icon, 'Store');
export const Tag = /*#__PURE__*/ creer(Tag01Icon, 'Tag');
export const Target = /*#__PURE__*/ creer(Target02Icon, 'Target');
export const Ticket = /*#__PURE__*/ creer(Ticket01Icon, 'Ticket');
export const ToggleLeft = /*#__PURE__*/ creer(ToggleOffIcon, 'ToggleLeft');
export const ToggleRight = /*#__PURE__*/ creer(ToggleOnIcon, 'ToggleRight');
export const Trash2 = /*#__PURE__*/ creer(Delete02Icon, 'Trash2');
export const TrendingDown = /*#__PURE__*/ creer(ChartDecreaseIcon, 'TrendingDown');
export const TrendingUp = /*#__PURE__*/ creer(ChartIncreaseIcon, 'TrendingUp');
export const Truck = /*#__PURE__*/ creer(DeliveryTruck01Icon, 'Truck');
export const User = /*#__PURE__*/ creer(UserIcon, 'User');
export const UserCheck = /*#__PURE__*/ creer(UserCheck01Icon, 'UserCheck');
export const UserCircle = /*#__PURE__*/ creer(UserCircleIcon, 'UserCircle');
export const UserX = /*#__PURE__*/ creer(UserRemove01Icon, 'UserX');
export const Users = /*#__PURE__*/ creer(UserGroupIcon, 'Users');
export const Utensils = /*#__PURE__*/ creer(Restaurant01Icon, 'Utensils');
export const UtensilsCrossed = /*#__PURE__*/ creer(SpoonAndForkIcon, 'UtensilsCrossed');
export const Warehouse = /*#__PURE__*/ creer(WarehouseIcon, 'Warehouse');
export const Wheat = /*#__PURE__*/ creer(WheatIcon, 'Wheat');
export const X = /*#__PURE__*/ creer(Cancel01Icon, 'X');
export const XCircle = /*#__PURE__*/ creer(CancelCircleIcon, 'XCircle');
export const Zap = /*#__PURE__*/ creer(FlashIcon, 'Zap');

// Petit point plein (séparateurs, saisie de code) : pas d'équivalent en contour dans la bibliothèque.
export const Dot = forwardRef<SVGSVGElement, IconProps>(({ size = 24, className, ...reste }, ref) => (
  <svg ref={ref} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className} {...reste}>
    <circle cx="12" cy="12" r="2.5" />
  </svg>
));
Dot.displayName = 'Dot';
