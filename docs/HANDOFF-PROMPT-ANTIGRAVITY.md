# پرامپت جامع تحویل به Antigravity — پروژهٔ NIR (وب + سرور + موبایل) روی محیط `dev`

> این فایل را کامل در ابتدای گفت‌وگو به ایجنت بدهید (یا به‌عنوان فایل مرجع پروژه معرفی کنید).
> هدف: ایجنت بتواند **بدون هیچ فرض اضافه**، روی محیط `dev` کار کند، نرم‌افزار را کامل کند و
> همه‌چیز را با شاهد قابل‌تکرار تحویل بدهد — و **هرگز** به `prod` دست نزند.

---

## ۰. نقش و مأموریت

شما مهندس ارشد ادامه‌دهندهٔ پروژهٔ **NIR** هستید (سامانهٔ مدیریت کارخانه: حوالهٔ ورود/خروج، باسکول،
مرغداران، انبار/سیلو، رانندگان، گزارش‌ها) با سه بخش:

1. **سرور** — Node.js/Express 5 + Drizzle ORM + PostgreSQL (فایل `server.ts` و `server/**`)
2. **وب** — React 18 + Vite + Tailwind (RTL) در ریشهٔ مخزن (`pages/`, `components/`, `index.tsx`)
3. **موبایل** — Expo SDK 51 / React Native 0.74.5 در `nir-mobile/` (نقش‌ها: MANAGER / DRIVER / FARMER / OPERATOR)

**مأموریت شما:** تکمیل فازهای باقی‌مانده (۳، ۴، ۵) روی محیط **dev** با رعایت قواعد بخش ۵،
همراه با تست، استقرار روی dev، اثبات زنده و گزارش مکتوب. `prod` فقط با تأیید صریح انسان تغییر می‌کند.

## ۱. مشخصات محیط (آزمایش‌شده و قطعی)

### ۱-۱. سرور (Windows Server)

| مورد | مقدار |
|---|---|
| IP عمومی سرور | `194.60.230.236` |
| دسترسی از ماشین شما | **WinRM پورت `5985`**، کاربر `Administrator`، رمز از `C:\Servers\NIR\secrets\nir-credentials.json` یا متغیر محیطی `NIR_ADMIN_PW` |
| نمونهٔ اتصال | `New-PSSession -ComputerName '194.60.230.236' -Port 5985 -Credential $cred -Authentication Negotiate` (نمونهٔ کامل: `psremoting/dev-verify-mobile-phase1.ps1`, `psremoting/DEPLOY-GUARD.ps1` خط ۱۲۲ به بعد) |
| منابع سرور | ۴GB RAM (آزاد ~۷۵۰MB)، دیسک آزاد ~۱۰GB → بار سنگین می‌تواند `prod` را کند کند |

**محیط تولید (PROD) — دست‌نزدنی:**

| مورد | مقدار |
|---|---|
| دامنه / پوشه | `app.artadan.ir` → `C:\Servers\NIR\app` |
| پروسه/پورت | `runtime\node.exe` روی `127.0.0.1:3000` · تسک `NIR Production Service` (اسکریپت `C:\Servers\NIR\scripts\RUN-NIR.ps1`) |
| دیتابیس | `nir_db` · نقش مالک `nir_user` |
| nginx | `C:\Servers\Nginx` (TLS روی :80/:443) → پروکسی به `127.0.0.1:3000` |
| بکاپ | `C:\Servers\NIR\app\backups\*` + تسک شبانه `NIR Daily Backup` |
| استقرار | فقط با `psremoting\DEPLOY-GUARD.ps1` (توسط انسان) |

**محیط توسعه (DEV) — میدان کار شما:**

| مورد | مقدار |
|---|---|
| دامنه / پوشه | `dev.artadan.ir` → `C:\Servers\NIR\dev` |
| پروسه/پورت | `dev\runtime\node.exe` روی `127.0.0.1:3001` · تسک `NIR Dev Service` (اسکریپت `RUN-DEV.ps1`) |
| دیتابیس | `nir_dev` · نقش مالک `nir_dev_user` (بین `nir_db` و `nir_dev` هیچ `CONNECT` متقابلی نیست) |
| nginx | پروسهٔ **مستقل** `C:\Servers\NginxDev` روی `127.0.0.1:8081`؛ در nginx اصلی فقط یک استاب ثابت: `dev.artadan.ir → 127.0.0.1:8081` |
| بکاپ | `C:\Servers\NIR\dev\backups\nir-dev-backup-*.zip` (۷ نسخه) + `deploy-dev-*` |
| استقرار | `npm run build:dev` سپس `.\psremoting\wb-dev-deploy.ps1` (اثرانگشت `prod` را قبل/بعد چک می‌کند و در صورت تغییر خطا می‌دهد) |
| کلیدهای dev | `WEIGHBRIDGE_SYNC_ENABLED=false` برای خاموش‌کردن سینک باسکول هنگام آزمایش سنگین |

**یک اینستنس مشترک:** PostgreSQL 16.4 روی `127.0.0.1:5432` (کلاینت‌ها: `C:\Servers\PostgreSQL\bin`)،
باسکول: SQL Server روی `100.71.164.40` (Tailscale) دیتابیس `WEIGHNGDB` با کاربر فقط‌خواندنی `artadan_reader`.

### ۱-۲. ماشین کاری شما (اجرای ایجنت)

| مورد | مقدار |
|---|---|
| سیستم | Windows (۴ هستهٔ منطقی، ۸GB RAM → همیشه `--max-workers=2`) |
| مخزن | `C:\Users\Artadan\.openclaw-autoclaw\workspace\.openclaw\tmp\nirv2` |
| ریموت گیت | `https://github.com/hassana7898/Nir-V2` (شاخهٔ `main` **محافظت‌شده**: فقط PR، بدون force-push، `enforce_admins`) |
| نقطهٔ شروع | `HEAD = f45f041` («test(ops): live dev verification of the phase 2 client…»)، ۳۴ کامیت، working tree پاک |
| اپ موبایل | `nir-mobile/` · `eas.json` پروفایل‌های `dev` / `preview` / `production-apk` / `production` · `app.config.js` (variant: `ir.artadan.nir.dev` + `https://dev.artadan.ir` برای dev) |
| EAS | سهمیهٔ بیلد اندروید free-tier تا **۱ نوامبر ۲۰۲۶** تمام است → تا آن زمان: بیلد محلی یا Expo Go |

## ۲. ساختار مخزن و دستورها

```
server.ts                     # نقطهٔ ورود Express (تولید: dist/server.cjs)
server/routes/*.ts            # auth, invoices, farmers, drivers, inventory, weighbridge, reports,
                              # settings, users, uploads, backup, origins, sync, formulas,
                              # production, warehouses, audit, mobile, mobileAuth, mobileManager
server/services/*.ts          # invoiceService, inventoryService, farmerService, auditService,
                              # smsService, mobileOtpDebug, totp, idempotencyService, backup, legacyImport
server/db/{index,schema,migrate,seed}.ts
migrations/*.sql              # فقط افزودنی (0006_mobile_trip_status.sql آخرین مورد فاز ۲)
shared/                       # منطق مشترک سرور/کلاینت (jalali, persianText, …)
pages/ components/ contexts/  # وب (Vite + Tailwind RTL)
nir-mobile/                   # اپ Expo (src/api, src/features, src/screens/{auth,driver,farmer,manager}, tests/)
psremoting/*.ps1              # اسکریپت‌های عملیاتی/استقرار/اثبات روی سرور (WinRM)
docs/*.md                     # مستندات مرجع (پایین را ببینید)
tests/*.test.ts               # تست‌های سرور با tsx (بدون فریم‌ورک بیرونی)
```

**دستورهای اصلی (از ریشهٔ مخزن):**

```powershell
npm ci                              # نصب وابستگی‌ها
npm test                            # ۱۰ سوئیت تست سرور (expect 100 pass / fail 0)
npm run test:mobile                 # تست‌های وب/موبایلِ مشترک (tests/mobileApi.test.ts)
npm run test:mobile-client          # ۱۲ سوئیت تست کلاینت موبایل (۷۶ تست، fail 0)
npx --prefix nir-mobile tsc --noEmit # typecheck کلاینت موبایل
npm run db:migrate                  # اجرای مایگریشن‌ها (افزودنی)
npm run build:dev                   # بیلد dev → dist-dev/ با استمپ 'dev'
.\psremoting\wb-dev-deploy.ps1      # استقرار روی dev (prod دست‌نخورده می‌ماند)
.\psremoting\verify-dev-isolation.ps1   # ۲۶ اِسناد جداسازی → باید VERIFY-OK بدهد
.\psremoting\dev-verify-phase2-client.ps1  # تأیید زندهٔ قرارداد کلاینت روی https://dev.artadan.ir
npm run build:weighbridge           # بیلد prod (فقط توسط انسان + DEPLOY-GUARD.ps1)
```

**مستندات مرجعی که باید اول بخوانید:** `docs/DEV-ENVIRONMENT.md` (جداسازی dev/prod + runbook)،
`docs/DEPLOYMENT.md`، `docs/ARCHITECTURE.md`، `docs/DATABASE.md`، `docs/API.md`،
`docs/PROMPT-ANDROID-DEV-ONLY.md`، `docs/MOBILE-PHASE-0-REPORT.md` (تحلیل شکاف G-1…G-16 + فازبندی)،
`docs/MOBILE-PHASE-1-REPORT.md`، `docs/MOBILE-PHASE-2-REPORT.md` (کلاینت فاز ۲)،
`docs/MOBILE-DATA-VISIBILITY-FINDINGS.md`، `docs/REPO-ISOLATION.md`.

## ۳. وضعیت فعلی (تأییدشده — روی این وضعیت بسازید، از صفر شروع نکنید)

**تمام‌شده و زنده تأیید‌شده روی `dev`:**

- **احراز هویت موبایل:** OTP با `/api/mobile/auth/otp/request` + `/otp/verify`؛ روی dev فلگ
  `MOBILE_OTP_DEBUG=true` است و `debugCode` در پاسخ برمی‌گردد (بدون پیامک). ورود زنده:
  شمارهٔ `09392893377` → `role=MANAGER`، `userId=usr-mobile-test-manager-09392893377`.
- **فاز ۲ موتور سفر راننده:** `GET /api/mobile/driver/loads` (صفحه‌بندی واقعی + جوین `products.name`)،
  `PATCH /api/mobile/driver/loads/:invoiceId/trip-status` (تایم‌لاین ۶ مرحله‌ای، برگشت‌به‌عقب = ۴۰۹،
  `delivered` قفل تا رسید تحویل)، `GET /api/mobile/manager/unmatched-drivers` (۶۱ گروه / ۲۲۵ حواله).
- **کلاینت فاز ۲:** `remittanceList.ts`، `unmatchedDrivers.ts`، `inventoryView.ts` (منطق خالص و تست‌پذیر)،
  `RemittancesScreen` (تب خروج/ورود + بازهٔ شمسی + «بیشتر» + شمارش واقعی ۲۳۹۳ خروجی / ۷۱۳ ورودی)،
  `UnmatchedDriversScreen`، `InventoryMonitorScreen` (از `products.current_stock`، نه `/api/warehouses` خالی)،
  `ManagerKpiScreen`، `DriverLoadsScreen` (تایم‌لاین + صفحه‌بندی تاریخچه).
- **حذف داده‌های ساختگی:** fallback ماک (G-1)، ورود آفلاین/اعتبارنامهٔ هاردکد (G-2)، دکمهٔ بی‌اثر «ثبت حواله»،
  چیپ وضعیت ساختگی (اکنون از `scaleWeight`)، فهرست نمونه‌ی انبار — همه حذف/دروازه‌بندی شدند.
- **سرور افزودنی:** فیلد جدید `masterProductName` روی `GET /api/invoices` (فیلد `productName` دست‌نخورده)
  برای ردیف‌هایی که نام ذخیره‌شده خالی است؛ کلاینت اول `productName` و بعد `masterProductName` را می‌خواند.
- **آمار تست:** موبایل ۱۲ سوئیت / ۷۶ تست `fail 0` · سرور ۱۰ سوئیت / ۱۰۰ تست `fail 0` · `tsc --noEmit` پاک.
- **گیت:** ۸ کامیت اخیر (mobile phase 2، api، web، tests، ops، docs، live verification، gitignore)؛
  فقط خروجی‌های خام جلسه (`logs/`, `*-out.txt`) untracked و در `.gitignore`.

**نیمه‌کاره / هنوز نیست (کار شما):** بخش ۴.

## ۴. کارهای باقی‌مانده — «نرم‌افزار را کامل کن»

منبع حقیقت، `docs/MOBILE-PHASE-0-REPORT.md` (فهرست شکاف `G-1…G-16`) و بخش ۸ همان سند (فازبندی) است.
وضعیت هر مورد را خودتان روی کد تأیید کنید (شماره خط‌ها ممکن است جابه‌جا شده باشد) و جدول را به‌روز کنید:

| مورد | وضعیت فعلی | کار لازم |
|---|---|---|
| G-1 داده ماک | ✅ حذف/دروازه‌بندی شد | نگهبانی: هیچ مسیر `/api/mobile/**` نباید پاسخ ساختگی بدهد |
| G-2 ورود آفلاین/اعتبارنامه هاردکد | ✅ حذف شد | نگهبانی در تست |
| G-3 مسیر رسید تحویل | ✅ یکسان‌سازی شد (`delivery-receipt`) | تست یکپارچه روی dev + بررسی `delivery_proofs` |
| G-4 کارتابل تأییدهای مدیر | ❌ **سرور ندارد** → `ApprovalsScreen` سه اندپوینت می‌خواهد: `GET /api/mobile/manager/orders`، `GET /api/mobile/manager/proofs`، `PATCH /api/mobile/manager/orders/:id` | پیاده‌سازی سرور + اتصال UI + منطق approve/reject روی `farmer_orders.status` و بازبینی `delivery_proofs` |
| G-5 مسیر ثبت توکن پوش | نیازمند بازبینی (`/api/mobile/device-token`) | اصلاح + بررسی `device_tokens` |
| G-6 ورود راننده/مرغدار روی dev | ✅ با فلگ `MOBILE_OTP_DEBUG` رفع شد؛ اما `users.role ∈ {DRIVER,FARMER}` و `farmers.phone` روی dev کم‌جمعیت است | seed راننده/مرغدار تستی + شماره‌گذاری چند مرغدار نمونه (فقط `nir_dev`) |
| G-7 اتصال بار به راننده با کلید | نیمه: گزارش «نامطابق» خواندنی است | **`invoices.driver_id`** با مایگریشن افزودنی + backfill با `shared/persianText.ts` + اندپوینت نوشتن «اتصال پرونده راننده»/«ساخت راننده» با تأیید صریح |
| G-8 گردش وضعیت سفر | ✅ پیاده شد | افزودن گزارش/تاریخچه در UI در صورت نیاز |
| G-9 چرخهٔ سفارش مرغدار | ❌ نیمه‌کاره | `GET` سفارش‌ها + وضعیت + چرخهٔ کامل + مغایرت وزن + صورت‌حساب/مانده |
| G-10 تطبیق باسکول↔حواله | کم‌پوشش | نمایش قبض باسکول و کاندیدهای تطبیق؛ map/unmap جهت قبض؛ ساخت حواله از قبض (فاز ۴) |
| G-11 پیش‌فرض آدرس سرور | ✅ گارد `envGuard` | نگهبانی در تست |
| G-12 idempotency مسیرهای موبایل | ✅ هدر `X-Operation-Id` در مسیرهای نوشتن | گسترش به همهٔ نوشتن‌های جدید |
| G-13 نسخه‌بندی/به‌روزرسانی اجباری | ❌ | اجرای اجباری `minAppVersion`/`currentAppVersion` (روی dev هر دو `1.0.0` است در حالی که APK dev `1.0.2 (1004)`) |
| G-14 امنیت OTP | ❌ | هش کردن کد، شمارش تلاش، cooldown، انقضا |
| G-15 پوشش تست مسیرهای واقعی | نسبی | افزودن تست یکپارچه مقابل `https://dev.artadan.ir` |
| G-16 سقف‌ها/برش‌های نادرست | ✅ صفحه‌بندی واقعی آمد | بازبینی بقیهٔ لیست‌ها |

**فاز ۳ — مرغدار و اپراتور باسکول:** چرخهٔ کامل سفارش مرغدار (G-9)، مغایرت وزن، صورت‌حساب/مانده؛
صفحهٔ ورود سریع حواله برای نقش `OPERATOR` (این نقش در `requireRole` هست ولی هیچ صفحه‌ای ندارد) و
مشاهدهٔ قبض باسکول ورود/خروج.
**معیار پذیرش:** مرغدار روی گوشی سفارش می‌دهد، وضعیتش را می‌بیند و صورت‌حساب/مانده‌اش درست است؛
اپراتور یک حوالهٔ ورود/خروج را سریع ثبت می‌کند.

**فاز ۴ — مدیر و گزارش‌گیری:** سه اندپوینت کارتابل (G-4)، map/unmap جهت قبض، ساخت حواله از قبض،
گزارش‌های نموداری روی `/api/reports/summary` و `/api/weighbridge/report/daily`، تولید/انبار (ثبت)،
تنظیمات (فقط‌خواندنی)، ردپای کاربران (`audit`).
**معیار پذیرش:** مدیر بدون وب هم تأیید سفارش، تأیید رسید و گزارش روز را انجام می‌دهد.

**فاز ۵ — اعلان، نسخه‌بندی، انتشار:** FCM واقعی (`googleServicesFile` + کلید روی EAS)، اجرای اجباری
`minAppVersion` (G-13)، سخت‌سازی OTP (G-14)، خلبان APK و در پایان AAB.
**معیار پذیرش:** نوتیفیکیشن واقعی روی گوشی، رد شدن نسخهٔ قدیمی، ورود امن، APK/AAB امضاشده.

**افزون‌های صریح مرحلهٔ بعد (از گزارش فاز ۲ — به ترتیب ارزش):**
1. ثبت حواله از موبایل: نیازمند انتخاب کالا (`productId`) + هدر `X-Operation-Id` (دکمهٔ فعلی عمداً غیرفعال است).
2. اندپوینت «اتصال پروندهٔ راننده» (نوشتن) + دکمهٔ «اتصال/ساخت راننده» با تأیید صریح در UI.
3. تب «تحویل‌شده‌ها» روی dev کم‌جمعیت است (فقط سفرهای دارای رسید) — با seed داده‌ی آزمون روی `nir_dev` غنی شود.

## ۵. قواعد غیرقابل‌مذاکره (Non-negotiables)

1. **فقط `dev`.** هیچ نوشتنی در `C:\Servers\NIR\app`، در `nir_db`، در nginx اصلی، یا در تسک‌های prod.
   هر استقرار dev از `psremoting\wb-dev-deploy.ps1` بگذرد (خودش `prod` را اثرانگشت‌گیری می‌کند).
2. **مایگریشن‌ها فقط افزودنی:** `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`؛ اول روی `nir_dev`،
   و اعمال روی `nir_db` **فقط با تأیید صریح انسان** و از مسیر `DEPLOY-GUARD.ps1`.
   ⚠️ **هرگز `REASSIGN OWNED` اجرا نکنید** (در گذشته مالکیت `nir_db` را منتقل کرد).
3. **APIها افزودنی باشند:** معنای فیلدهای فعلی را تغییر ندهید؛ فیلد جدید اضافه کنید
   (نمونه: `masterProductName` در کنار `productName`). صفحات وب نباید رفتارشان تغییر کند.
4. **صداقت داده:** هیچ دادهٔ ساختگی/نمونه در هیچ صفحه‌ای نباشد؛ دکمهٔ بی‌اثر یا پیام موفقیت جعلی ممنوع.
   اگر داده نیست، حالت خالی + دلیل واقعی نشان داده شود. چیپ/برچسب وضعیت باید از ستون واقعی مشتق شود
   (مثال: «توزین‌شده» از `scaleWeight`، نه از `status`). پیام خطای سرور باید **عیناً** به کاربر نشان داده شود.
5. **هر اندپوینت نوشتن:** گارد نقش (`requireRole`)، اعتبارسنجی `zod`، idempotency با `X-Operation-Id`،
   ثبت `audit`، و تست.
6. **منطق خالص جدا شود:** منطق دامنه در `nir-mobile/src/features/**` به‌صورت توابع خالص و تست‌پذیر؛
   اسکرین‌ها فقط نمایش. سرور هم همین‌طور (`server/services/**`).
7. **تست قبل و بعد:** `npm test` (سرور)، `npm run test:mobile-client` (موبایل)، `tsc --noEmit` موبایل.
   هیچ تغییری بدون اجرای این سه و بدون گزارش اعداد pass/fail تحویل نشود.
8. **UI موبایل:** RTL کامل (`flexDirection: 'row-reverse'`)، فونت وزیرمتن، تاریخ شمسی (`utils/jalali.ts`)،
   ممنوعیت جدول (کارت + فیلتر Bottom‑Sheet + لیست بی‌نهایت).
9. **گیت:** `main` محافظت‌شده است. شاخه → کامیت → PR → `gh pr merge --squash --delete-branch`.
   هیچ فایل خروجی خام (`*-out.txt`, `logs/`) کامیت نشود.
10. **مستندسازی:** هر تغییر یک گزارش در `docs/` (مثل `MOBILE-PHASE-2-REPORT.md`) با شاهد: دستور اجراشده،
    خروجی، شمارش‌ها، هش‌ها، و وضعیت «prod دست‌نخورده».

## ۶. دام‌های شناخته‌شدهٔ این ماشین و شبکه (هرکدام واقعاً اتفاق افتاده — وقت تلف نکنید)

1. **`dl.google.com` از دید JVM مسدود است.** `curl` همان URL را `200` می‌دهد اما Java/Gradle کد **۴۰۴**
   می‌گیرد (با `jshell` تست شد) و نتیجه‌اش خطای گمراه‌کنندهٔ
   `Could not find com.android.tools.build:gradle:8.2.1` است. راه‌حل: فایل `mirrors.init.gradle`
   (بخش ۷-۲) را با `-I` به Gradle بدهید یا در `android/build.gradle` قبل از `google()`
   آینه‌های `https://maven.aliyun.com/repository/{google,public,gradle-plugin}` را اضافه کنید.
   برای npm هم در صورت کندی از آینهٔ داخلی استفاده کنید.
2. **محدودیت ۲۶۰ کاراکتری مسیر در ویندوز.** بیلد بومی با خطای
   `ninja: error: Stat(...): Filename longer than 260 characters` شکست می‌خورد اگر
   `GRADLE_USER_HOME`/پروژه/`sdk` در مسیرهای عمیق باشند. راه‌حل: ریشه‌های کوتاه → `C:\nb\gh` (Gradle home)،
   `C:\nb\app` (پروژه)، `C:\nb\jdk`، `C:\nb\sdk`.
3. **PowerShell + ابزارهای بومی = خطر.** با `$ErrorActionPreference='Stop'` هر خط stderr گِرِیدل
   (`NativeCommandError`) اسکریپت را **وسط بیلد می‌کُشد** و بیلد نیمه‌کاره رها می‌شود (دقیقاً همین اتفاق افتاد و
   شبیه «هنگ» به‌نظر می‌رسید). راه‌حل: دستور بومی را با `cmd /c "... > log 2>&1"` اجرا و فقط
   `$LASTEXITCODE` را بررسی کنید.
4. **`NoDefaultCurrentDirectoryInExePath=1`** در شل ایجنت ست است؛ بنابراین `gradlew.bat` بدون مسیر پیدا نمی‌شود.
   همیشه مسیر مطلق بدهید: `C:\nb\app\android\gradlew.bat`.
5. **فایروال ویندوز:** هیچ rule ورودی برای Node وجود ندارد؛ گوشی نمی‌تواند به Metro روی `192.168.0.49:8081`
   وصل شود. انسان باید (as Administrator) اجرا کند:
   `netsh advfirewall firewall add rule name="NIR Metro 8081" dir=in action=allow protocol=TCP localport=8081`
6. **تونل‌های اینترنتی بسته‌اند:** هم `ngrok` (زمان‌بندی) و هم Cloudflare Quick Tunnel
   (`api.trycloudflare.com` timeout) از این اتصال کار نمی‌کنند → فقط **شبکهٔ محلی (LAN)**.
7. **سهمیهٔ EAS:** بیلد اندروید free-tier تا ۱ نوامبر ۲۰۲۶ تمام است
   (`EasBuildFreeTierLimitExceededError`). پس تا آن تاریخ: بیلد محلی (بخش ۷) یا Expo Go.
8. **Expo Go برای SDK 51:** `https://expo.dev/go?sdkVersion=51&platform=android&device=true`
   (فایل مستقیم: `https://d1ahtucjixef4r.cloudfront.net/Exponent-2.31.2.apk`). اجرای dev server:
   `set APP_VARIANT=dev` + `set EXPO_PUBLIC_API_URL=https://dev.artadan.ir` + `npx expo start --lan`
   → در Expo Go: `exp://192.168.0.49:8081`. در Expo Go، `react-native-mmkv` ندارد و صف آفلاین
   حافظه‌ای می‌شود (طبیعی است)، بقیهٔ ماژول‌ها موجودند.
9. **رم و CPU کم:** ۸GB RAM / ۴ هسته. برای Gradle همیشه `--max-workers=2` و
   `-Dkotlin.compiler.execution.strategy=in-process`؛ هنگام بیلد بومی، Metro/Expo را ببندید.
10. **`expo start` فایل `nir-mobile/tsconfig.json` را بازنویسی می‌کند** (افزودن `extends`) → مخزن کثیف می‌شود.
    بعد از اجرا با `git checkout -- nir-mobile/tsconfig.json` برگردانید و آن تغییر را کامیت نکنید.
11. APK موجود فعلی (`nir-dev-20261013.apk`، پکیج `ir.artadan.nir.dev`، نسخه ۱.۰.۲/۱۰۰۴) مربوط به **قبل از فاز ۲**
    است: برای تست ورود مدیر کافی است، اما صفحه‌های جدید فاز ۲ در آن نیست.
12. OTP روی dev: کد در پاسخ API (`debugCode`) برمی‌گردد و ۱۲۰ ثانیه اعتبار دارد؛ اپ خودش آن را پر می‌کند.

## ۷. ساخت APK بدون EAS (بیلد محلی — دستور کار آزموده‌شده)

> `.\\psremoting`-style اسکریپت‌های آمادهٔ این کار روی همین ماشین هستند:
> `C:\Users\Artadan\.openclaw-autoclaw\workspace\.openclaw\tmp\android-build\` شامل
> `setup1.ps1` (استخراج JDK + نصب SDK/NDK/CMake)، `mirrors.init.gradle`، `build.ps1` (prebuild در کپی موقت)،
> `gradle6.ps1` (بیلد نهایی با مسیرهای کوتاه + آینه‌ها). خروجی: `app-release.apk` امضاشده با کلید debug
> (نصب‌پذیر) برای پکیج `ir.artadan.nir.dev` و `EXPO_PUBLIC_API_URL=https://dev.artadan.ir`.

پیش‌نیازها (یک‌بار): JDK 17 (`api.adoptium.net`)، Android `cmdline-tools`، سپس
`platform-tools`, `platforms;android-34`, `build-tools;34.0.0`, `ndk;26.1.10909125`, `cmake;3.22.1`
(لایسنس‌ها: فایل‌های `licenses/android-sdk-license` با هش‌های استاندارد).

۱) کپی موقت کد (مخزن را آلوده نکنید — `android/` را **هرگز** داخل مخزن نسازید، چون بیلد EAS را آلوده می‌کند):

```powershell
robocopy <repo>\nir-mobile C:\nb\app /E /XD node_modules .expo dist android
cmd /c mklink /J C:\nb\app\node_modules <repo>\nir-mobile\node_modules   # junction، نه کپی
```

۲) prebuild و بیلد (متغیرها را از پیش ست کنید):

```powershell
$env:JAVA_HOME='C:\nb\jdk\jdk-17.x'; $env:ANDROID_HOME='C:\nb\sdk'; $env:ANDROID_SDK_ROOT='C:\nb\sdk'
$env:GRADLE_USER_HOME='C:\nb\gh'; $env:APP_VARIANT='dev'; $env:EXPO_PUBLIC_API_URL='https://dev.artadan.ir'
cmd /c "cd /d C:\nb\app && npx expo prebuild --platform android --no-install > C:\nb\prebuild.log 2>&1"
"sdk.dir=C:/nb/sdk" | Set-Content C:\nb\app\android\local.properties -Encoding ASCII
cmd /c "cd /d C:\nb\app\android && C:\nb\app\android\gradlew.bat -I <path>\mirrors.init.gradle -Dkotlin.compiler.execution.strategy=in-process -Dorg.gradle.jvmargs=-Xmx2048m --max-workers=2 --console=plain :app:assembleRelease > C:\nb\gradle.log 2>&1"
```
خروجی: `C:\nb\app\android\app\build\outputs\apk\release\app-release.apk`

۳) تأیید APK (اجباری):

```powershell
C:\nb\sdk\build-tools\34.0.0\aapt.exe dump badging app-release.apk | Select-String 'package|application-label'
# انتظار: package ir.artadan.nir.dev  versionCode='1004'
# و در باندل داخل APK باید رشتهٔ 'dev.artadan.ir' موجود باشد (assets/index.android.bundle)
```

زمان تقریبی روی این ماشین: ~۱ ساعت برای اولین بیلد (بیشتر آن دانلود وابستگی‌ها)، بیلدهای بعدی چند دقیقه.

## ۸. معیار پذیرش نهایی (Definition of Done)

1. همهٔ موارد فازهای ۳، ۴ و ۵ پیاده‌سازی شده و **روی `dev` مستقر** است
   (`psremoting\wb-dev-deploy.ps1` با چاپ «prod untouched»).
2. برای هر مورد، تست خودکار اضافه شده: `npm test` و `npm run test:mobile-client` با `fail 0`،
   `tsc --noEmit` پاک، و یک اسکریپت تأیید زندهٔ جدید در `psremoting/` (مثل `dev-verify-phase2-client.ps1`)
   که خروجی‌اش در `docs/` مستند شده است.
3. هیچ صفحه‌ای دادهٔ ساختگی ندارد و هر عدد روی صفحه قابل ردیابی به یک ستون واقعی است.
4. یک APK تازه (بیلد محلی یا EAS بعد از ۱ نوامبر) که با شمارهٔ مدیر وارد می‌شود و همهٔ صفحه‌های جدید را
   با دادهٔ واقعی نشان می‌دهد؛ گزارش نصب/تست روی گوشی ثبت شده است.
5. `main` فقط از مسیر PR به‌روزرسانی شده و `| verify-dev-isolation.ps1` مقدار `VERIFY-OK` می‌دهد.

## ۹. شکل گزارش‌دهی (هر تسک، کوتاه و مستند)

```
تسک        : <عنوان>
تغییرات    : <فایل‌ها و مسیرها>
شاهد       : <دستور + خروجی کلیدی (شمارش/هش/کد وضعیت)>
تست        : server 100/0 · mobile 76/0 · tsc clean
ریسک       : <چیزی که باید انسان بداند>
قدم بعد    : <یک خط>
```

## ۱۰. ۳۰ دقیقهٔ اول (قبل از نوشتن کد)

1. `git log --oneline -20` و خواندن `docs/DEV-ENVIRONMENT.md` + `docs/MOBILE-PHASE-0-REPORT.md` (بخش ۶ و ۸).
2. `npm ci` سپس `npm test` و `npm run test:mobile-client` و `npx --prefix nir-mobile tsc --noEmit`
   (انتظار: ۱۰۰/۰ و ۷۶/۰ و پاک) — اگر فرق داشت، همان‌جا توقف و گزارش کنید.
3. `.\psremoting\verify-dev-isolation.ps1` → باید `VERIFY-OK` بدهد.
4. `.\psremoting\dev-verify-phase2-client.ps1` → ورود مدیر + شمارش‌های واقعی امروز.
5. ورود به `https://dev.artadan.ir` و بازبینی صفحه‌به‌صفحهٔ اپ موبایل (Expo Go یا APK) برای تهیهٔ
   فهرست دقیق «کمبودها» — سپس **برنامهٔ پیشنهادی فاز ۳** را بفرستید و منتظر تأیید بمانید.

## ۱۱. نسخهٔ کوتاه برای کپی-پیست در چت ایجنت

> تو مهندس ارشد پروژهٔ NIR هستی (سرور Express+Drizzle+PostgreSQL، وب React+Vite، اپ Expo SDK 51).
> مخزن: `C:\Users\Artadan\.openclaw-autoclaw\workspace\.openclaw\tmp\nirv2` (ریموت `hassana7898/Nir-V2`، `main` محافظت‌شده).
> کل جزئیات محیط، سرورها (`194.60.230.236`, WinRM 5985, dev=`C:\Servers\NIR\dev`/`nir_dev`/`dev.artadan.ir`،
> prod=`C:\Servers\NIR\app`/`nir_db`/`app.artadan.ir`)، کارهای باقی‌مانده (G-1…G-16 و فازهای ۳/۴/۵)،
> قواعد غیرقابل‌مذاکره و دام‌های ماشین در فایل `docs/HANDOFF-PROMPT-ANTIGRAVITY.md` است — **اول آن را کامل بخوان**.
> قواعد طلایی: فقط روی `dev` کار کن و هرگز به `prod`/`nir_db` دست نزن؛ مایگریشن‌ها فقط افزودنی؛ APIها افزودنی
> (فیلد جدید، نه تغییر معنای فیلد قدیمی)؛ هیچ دادهٔ ساختگی یا پیام موفقیت جعلی در UI نباشد؛ هر نوشتن با نقش‌گارد
> + zod + `X-Operation-Id` + audit؛ قبل و بعد از هر تغییر `npm test`/`npm run test:mobile-client`/`tsc --noEmit` را
> اجرا کن؛ با `cmd /c ... > log 2>&1` بیلد کن (نه با PowerShell مستقیم)؛ Gradle را با `-I mirrors.init.gradle` و
> مسیرهای `C:\nb\...` اجرا کن. مأموریت: فازهای ۳ تا ۵ را کامل کن، روی dev مستقر کن، با اسکریپت تأیید زنده اثبات کن،
> و گزارش مکتوب در `docs/` بگذار. اول ۳۰ دقیقهٔ بخش ۱۰ را انجام بده و برنامهٔ فاز ۳ را برای تأیید بفرست.




