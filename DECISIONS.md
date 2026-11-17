# Decision log

## Decision 1: Централізація нормалізації статусів оплати в модулі Payments

**Problem:** Логіка перетворення сирих станів провайдера Stripe (`succeeded`, `requires_action`, `declined`) на внутрішні статуси системи була тричі продубльована в модулях `Orders`, `Reports` та `Notifications`.

**Evidence:** `src/orders/mapPaymentStatus.ts:1-7`, `src/reports/mapPaymentStatus.ts:1-7`, `src/notifications/mapPaymentStatus.ts:1-7`.

**Decision:** Створити єдину функцію нормалізації `mapPaymentStatus` у `src/payments/mapPaymentStatus.ts`, яка повертає канонічний тип `PaymentStatus` (`"paid" | "processing" | "failed"`), а в інших модулях залишити лише делегування до неї.

**Why:** Це забезпечує High Cohesion та Information Hiding: лише модуль `Payments` знає семантику кодів відповіді платіжного шлюзу, тому додавання статусу `processing` виконується в одній точці без ризику розсинхронізації звітів чи сповіщень.

**Alternative:** Оновити умову `if (response.state === "requires_action") return "processing"` окремо в кожному з трьох файлів `mapPaymentStatus.ts`.

**Why rejected:** Порушує принцип Design for Change і зберігає прихований coupling між трьома модулями та внутрішнім форматом `StripeResponse`.

**Trade-off:** Модулі `Orders`, `Reports` і `Notifications` тепер залежать від спільного типу статусу, визначеного в публічному контракті `Payments`.

**Verification:** Усі стартові функціональні тести та новий unit-тест `mapPaymentStatus normalizes paid, processing, failed and unknown provider statuses` успішно проходять (`npm test`).

## Decision 2: Fail-safe обробка невідомих статусів платіжного провайдера як failed

**Problem:** Зовнішній платіжний провайдер може повернути новий або недокументований код стану транзакції, який ще не описаний у мапінгу системи.

**Evidence:** `src/payments/mapPaymentStatus.ts:5-12` (обробка значень поза переліком `succeeded` та `requires_action`).

**Decision:** Будь-який невідомий або неочікуваний статус провайдера за замовчуванням нормалізується у безпечний стан `"failed"`, що переводить замовлення у статус `"payment_pending"`.

**Why:** За принципом Explicit Contracts та фінансової безпеки непідтверджена або невідома відповідь шлюзу ніколи не повинна трактуватися як успішна оплата (`paid`), щоб уникнути безкоштовного відвантаження товару клієнту.

**Alternative:** Кидати необроблений виняток (`throw new Error("Unknown status")`) або переводити невідомий статус у стан `"processing"`.

**Why rejected:** Виняток зламає публічний контракт Checkout API (замість контрольованої відповіді повернеться HTTP 500), а статус `"processing"` введе користувача в оману щодо активної обробки невалідного платежу.

**Trade-off:** Якщо провайдер введе новий проміжний статус успіху без оновлення нашого адаптера, транзакція тимчасово вважатиметься неуспішною до виправлення мапінгу.

**Verification:** Перевірено unit-тестом передачі об'єкта `{ state: "unexpected_gateway_code" }` у `mapPaymentStatus`, який детерміновано повертає `"failed"`.

## Decision 3: Інкапсуляція Stripe за публічним контрактом PaymentService та розрив циклу з Orders

**Problem:** `CheckoutController` сам конструював `StripePayload` (переводив гривні в копійки), `OrderService` напряму викликав `payments/internal/StripeClient`, а `StripeClient` імпортував `orders/internal/orderMutations.ts`, утворюючи циклічну залежність `Orders <-> Payments`.

**Evidence:** `src/checkout/CheckoutController.ts:21-26`, `src/orders/OrderService.ts:4`, `src/payments/internal/StripeClient.ts:2,20`.

**Decision:** Ввести публічний фасад `PaymentService` із провайдеро-незалежним методом `authorizePayment(request)` і видалити виклик `markOrderPaid` зі `StripeClient`, передавши відповідальність за оновлення стану замовлення назад у `OrderService`.

**Why:** Забезпечує Information Hiding, Explicit Contracts та правильний Dependency Direction: `Orders` залежить лише від публічного API `Payments`, а `Payments` більше нічого не знає про внутрішню структуру замовлень.

**Alternative:** Передати callback-функцію оновлення замовлення всередину `StripeClient.createCharge`.

**Why rejected:** Залишає прихований побічний ефект всередині низькорівневого HTTP-клієнта та ускладнює тестування оплати окремо від бази замовлень.

**Trade-off:** Додався додатковий проміжний шар `PaymentService` та мапінг DTO між доменною моделлю й форматом Stripe.

**Verification:** Перевірено відсутність імпортів із `payments/internal` та `orders/internal` у зовнішніх модулях і проходженням функціональних тестів Checkout.

## Decision 4: Захист інваріанта залишків через атомарну операцію StockRepository.reserve

**Problem:** `OrderService` напряму читав і перезаписував `database.stock` у циклі по рядках кошика, а `StockRepository.updateAvailable` дозволяв будь-якому модулю виставити довільний або від'ємний залишок.

**Evidence:** `src/orders/OrderService.ts:15-25`, `src/inventory/StockRepository.ts:9-11`.

**Decision:** Прибрати прямий доступ до `database.stock` із `OrderService`, видалити відкритий метод `updateAvailable` і реалізувати в `StockRepository` метод `reserve(items)`, який спочатку валідує достатність усіх товарів і лише після цього застосовує списання.

**Why:** Відновлює Ownership модуля `Inventory` над власними даними та гарантує інваріант `available >= 0` без часткової мутації залишків, якщо одного з товарів у кошику бракує.

**Alternative:** Залишити списання в `OrderService`, додавши попередній цикл перевірки перед циклом запису.

**Why rejected:** Правило цілісності залишків залишиться розмазаним поза модулем `Inventory`, і інший клієнтський код зможе знову його обійти.

**Trade-off:** Метод `reserve` виконує два проходи (розрахунок у тимчасову Map та фіксація), що трохи збільшує обсяг коду в `StockRepository`.

**Verification:** Додано тест `out-of-stock on second item does not partially mutate stock of first item`, який підтверджує незмінність залишку першого товару при помилці на другому.

## Decision 5: Перетворення calculateTotal на чисту детерміновану функцію

**Problem:** Функція `calculateTotal` читала глобальний об'єкт `runtimeConfig`, мутувала об'єкти вхідного масиву `lines` (додаючи поле `lineTotal`) і записувала події у глобальний масив `auditLog`.

**Evidence:** `src/shared/calculateTotal.ts:1`, `src/shared/calculateTotal.ts:11-23`.

**Decision:** Передавати правила розрахунку (`taxRate`, `discountPercent`) явно другим аргументом `pricing`, обчислювати суму без модифікації елементів `lines`, а запис в `auditLog` перенести на рівень оркестрації в `CheckoutController`.

**Why:** Відновлює принцип Local Reasoning: результат функції тепер повністю визначається її вхідними параметрами, вона не має побічних ефектів і може безпечно викликатися повторно або тестуватися ізольовано.

**Alternative:** Клонувати масив `lines` всередині `calculateTotal`, але залишити читання `runtimeConfig` та запис `auditLog`.

**Why rejected:** Це усуває лише мутацію вхідного аргументу, але залишає приховану залежність від глобального стану конфігурації та побічний ефект логування.

**Trade-off:** Викликаючий код (`CheckoutController`) тепер повинен явно передавати конфігурацію ставок податку/знижки та самостійно виконувати аудит-логування.

**Verification:** Перевірено unit-тестом `calculateTotal is pure, deterministic, does not mutate input lines or write auditLog`.

---

## AI review

- **Корисна пропозиція AI:** Пропозиція реалізувати двофазну перевірку у `StockRepository.reserve` через проміжну структуру `Map<string, number>` (`plannedUpdates`). Це дозволило коректно врахувати випадок, коли один і той самий `productId` зустрічається у кількох рядках кошика, і гарантувало відсутність часткового списання при нестачі товару на наступних позиціях.
- **Відхилена пропозиція AI:** Пропозиція створити повноцінну ієрархію класів `AbstractPaymentProvider`, фабрику `PaymentProviderFactory` та DI-контейнер для інжекції залежностей на рівні 75 балів. Відхилено через overengineering (зайва абстракція для одного активного провайдера ускладнює читання коду, хоча для рівня 75 достатньо чіткого публічного фасаду `PaymentService`).
- **Спосіб перевірки згенерованого рішення:** Перевірено шляхом запуску стартових функціональних тестів (`npm test`) для підтвердження незмінності публічного контракту Checkout API (`paid`, `failed`), а також написанням цільових unit- та інтеграційних тестів на атомарність резервування залишків, чистоту `calculateTotal` та обробку невідомих статусів оплати.