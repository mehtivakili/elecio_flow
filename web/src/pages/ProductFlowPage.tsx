import { Link } from 'react-router-dom';
import {
  Box, Check, ChevronLeft, Code2, Factory, LifeBuoy, MapPin, PackageCheck,
  PackageOpen, Route, ShoppingCart, Truck, Wrench, type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '../components/ui';

type FlowStep = {
  number: number;
  title: string;
  owner: string;
  description: string;
  items: string[];
  output: string;
  to: string;
  action: string;
  icon: LucideIcon;
  color: string;
};

export const PRODUCT_FLOW: FlowStep[] = [
  {
    number: 1,
    title: 'ثبت و بررسی سفارش',
    owner: 'فروش و مهندسی',
    description: 'نیاز مشتری و مدارک فنی قبل از تعهد زمان و قیمت نهایی کنترل می‌شود.',
    items: ['BOM', 'Gerber', 'Pick & Place', 'بررسی قیمت مناسب', 'بررسی موجودی قطعات'],
    output: 'خروجی: سفارش تأییدشده و قابل برنامه‌ریزی',
    to: '/sales/orders', action: 'مدیریت سفارش‌ها', icon: ShoppingCart, color: '#F5B85A',
  },
  {
    number: 2,
    title: 'تأمین و کیتینگ قطعات',
    owner: 'تأمین و انبار',
    description: 'کسری‌ها خریداری و همه اجزای موردنیاز تولید به‌صورت یک کیت کامل آماده می‌شوند.',
    items: ['کارت حافظه (SD Card)', 'باکس و جعبه لیزر', 'آداپتور ۱۲ ولت DC', 'کابل DB25', 'نمایشگر OLED و سیم SH', 'فلت و طلق OLED', 'Spacer و چسب قطره‌ای', 'پروگرامر و پورت XH', 'آهن‌ربا'],
    output: 'خروجی: کیت کامل و رزروشده برای تولید',
    to: '/scm/purchase-orders', action: 'سفارش‌های خرید', icon: PackageOpen, color: '#5EC8E5',
  },
  {
    number: 3,
    title: 'آماده‌سازی نرم‌افزار',
    owner: 'تولید نرم‌افزار',
    description: 'نسخه نرم‌افزار هر دستگاه پیش از مونتاژ نهایی آماده، ثبت و قابل ردیابی می‌شود.',
    items: ['پروگرام ESP', 'Firmware', 'Flash', 'Mount پوشه Data', 'فعال‌سازی License', 'راه‌اندازی سیستم گزارش‌گیری'],
    output: 'خروجی: برد پروگرام‌شده با نسخه ثبت‌شده',
    to: '/production/work-orders', action: 'دستورهای تولید', icon: Code2, color: '#B48CF2',
  },
  {
    number: 4,
    title: 'مونتاژ دستگاه',
    owner: 'خط تولید',
    description: 'قطعات مکانیکی و الکترونیکی طبق دستور تولید مونتاژ و برای کنترل کیفیت آماده می‌شوند.',
    items: ['نصب Spacer', 'لحیم‌کاری OLED', 'Power wire', 'Power button', 'بستن پیچ داخل دستگاه', 'نصب OLED و SH', 'نصب Flat', 'چسب‌کاری', 'نصب طلق OLED', 'نصب آهن‌ربا'],
    output: 'خروجی: دستگاه مونتاژشده با شماره سریال',
    to: '/production/work-orders', action: 'صف تولید', icon: Wrench, color: '#779BE7',
  },
  {
    number: 5,
    title: 'QC و بسته‌بندی',
    owner: 'کنترل کیفیت و بسته‌بندی',
    description: 'دستگاه تست می‌شود و همه اقلام تحویل در بسته نهایی قرار می‌گیرند.',
    items: ['تأیید چک‌لیست QC', 'نایلون دستگاه', 'آداپتور', 'کابل', 'محافظ حباب‌دار', 'کاتالوگ', 'پرینت جعبه', 'لوگو', 'کارت گارانتی'],
    output: 'خروجی: بسته تأییدشده و آماده ارسال',
    to: '/production/work-orders', action: 'کنترل تولید', icon: PackageCheck, color: '#C2DFE3',
  },
  {
    number: 6,
    title: 'انبارداری و ارسال',
    owner: 'انبار محصول و لجستیک',
    description: 'ورود محصول، تخصیص به سفارش و خروج محموله با اسناد حمل ثبت می‌شود.',
    items: ['انبارداری محصول', 'تخصیص سریال به سفارش', 'لیبل و کد تحویل', 'ترخیص و مجوز خروج', 'ثبت حمل‌کننده و رهگیری', 'تحویل محموله'],
    output: 'خروجی: محموله قابل رهگیری',
    to: '/units?status=in_stock', action: 'دستگاه‌های آماده', icon: Truck, color: '#F5B85A',
  },
  {
    number: 7,
    title: 'ارسال یا نصب در محل',
    owner: 'لجستیک و نصب',
    description: 'بر اساس قرارداد، محصول مستقیم تحویل یا توسط تیم فنی در محل مشتری نصب می‌شود.',
    items: ['هماهنگی زمان تحویل', 'ارسال برای مشتری', 'نصب و راه‌اندازی', 'ثبت محل و تاریخ نصب', 'تأیید تحویل مشتری'],
    output: 'خروجی: دستگاه فعال نزد مشتری',
    to: '/service/tickets?type=installation', action: 'برنامه نصب', icon: MapPin, color: '#0FD69D',
  },
  {
    number: 8,
    title: 'پشتیبانی پس از فروش',
    owner: 'خدمات مشتریان',
    description: 'تمام درخواست‌ها با اتصال به مشتری، سریال، گارانتی و سابقه ساخت پیگیری می‌شوند.',
    items: ['پشتیبانی فنی', 'گارانتی و تعمیر', 'پیگیری SLA', 'تاریخچه سرویس دستگاه', 'ثبت رضایت مشتری'],
    output: 'خروجی: خدمت قابل سنجش و مشتری پشتیبانی‌شده',
    to: '/service/tickets', action: 'تیکت‌های خدمات', icon: LifeBuoy, color: '#FF499E',
  },
];

export default function ProductFlowPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Route}
        title="فرآیند تأمین محصول"
        subtitle="از بررسی سفارش و تأمین قطعات تا مونتاژ، انبار، تحویل و پشتیبانی"
      />

      <section className="glass overflow-hidden">
        <div className="border-b border-line/60 bg-gradient-to-l from-amber/10 via-transparent to-mint/10 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-ink">یک مسیر، هشت ایستگاه عملیاتی</h2>
              <p className="mt-1 text-xs leading-6 text-mist">هر کارت به بخش اجرایی خودش متصل است؛ جزئیات سفارش، موجودی، تولید و خدمات در همان ماژول ثبت می‌شود.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-mist">
              <span className="h-2 w-2 rounded-full bg-mint" /> کنترل خروجی در پایان هر مرحله
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-line/40 sm:grid-cols-2 xl:grid-cols-4">
          {PRODUCT_FLOW.map((step, index) => (
            <article key={step.number} className="group relative flex min-h-[365px] flex-col bg-deep/75 p-5 transition hover:bg-ink/[0.055]">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="num flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-base font-extrabold text-night shadow-lg" style={{ background: step.color }}>
                    {step.number}
                  </span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: `${step.color}1f`, color: step.color }}>
                    <step.icon size={19} />
                  </span>
                </div>
                {index < PRODUCT_FLOW.length - 1 && <ChevronLeft size={18} className="mt-3 hidden text-slate xl:block" />}
              </div>

              <h3 className="text-base font-bold text-ink">{step.title}</h3>
              <p className="mt-1 text-[11px] font-medium" style={{ color: step.color }}>{step.owner}</p>
              <p className="mt-3 min-h-[52px] text-xs leading-6 text-mist">{step.description}</p>

              <ul className="mt-3 space-y-2 border-t border-line/50 pt-3">
                {step.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs leading-5 text-frost">
                    <span className="mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full" style={{ background: `${step.color}2b`, color: step.color }}>
                      <Check size={9} strokeWidth={3} />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-5">
                <p className="mb-3 rounded-xl bg-ink/[0.04] px-3 py-2 text-[11px] leading-5 text-mist">{step.output}</p>
                <Link to={step.to} className="flex items-center justify-between rounded-xl border border-line/70 px-3 py-2 text-xs font-medium text-ink transition hover:border-current" style={{ color: step.color }}>
                  <span>{step.action}</span><ChevronLeft size={15} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          [Factory, 'کیفیت در تمام مراحل', 'از قطعات تا محصول نهایی با کنترل موجودی، QC و ثبت سریال.'],
          [Route, 'فرآیند شفاف و قابل پیگیری', 'از BOM و فریمور تا محموله و نصب، همه رویدادها در پرونده دستگاه می‌ماند.'],
          [Truck, 'تحویل مطمئن', 'تخصیص سریال، لیبل، کد تحویل و رهگیری حمل برای تحویل قابل اتکا.'],
          [LifeBuoy, 'پشتیبانی پایدار', 'پس از نصب، همان پرونده وارد جریان گارانتی، تعمیر و خدمات پس از فروش می‌شود.'],
        ].map(([Icon, title, body]) => {
          const FeatureIcon = Icon as LucideIcon;
          return <div key={title as string} className="glass flex items-start gap-3 p-4"><FeatureIcon size={19} className="mt-0.5 shrink-0 text-amber" /><div><h3 className="text-sm font-semibold text-ink">{title as string}</h3><p className="mt-1 text-xs leading-6 text-mist">{body as string}</p></div></div>;
        })}
      </section>
    </div>
  );
}
