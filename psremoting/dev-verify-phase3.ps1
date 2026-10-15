# Live verification of the PHASE 3 CONTRACT against the DEV deployment (https://dev.artadan.ir).
#
# Verifies:
#   1. OPERATOR role OTP login (09120000005) -> returns role=OPERATOR
#   2. OPERATOR can query weighbridge monitor (/api/mobile/operator/weighbridge)
#   3. FARMER role OTP login (09120000002) -> returns role=FARMER
#   4. FARMER can fetch active feed products (/api/mobile/farmer/products)
#   5. FARMER can fetch comprehensive quota statement (/api/mobile/farmer/statement)
#   6. FARMER can place a feed order with X-Operation-Id idempotency (/api/mobile/farmer/orders)
#   7. Resubmitting with same X-Operation-Id is idempotent (no duplicate created)
#   8. MANAGER sees the placed order in cartable (/api/mobile/manager/orders)

[CmdletBinding()]
param(
  [string] $OperatorPhone = '09120000005',
  [string] $FarmerPhone   = '09120000002',
  [string] $ManagerPhone  = '09392893377',
  [string] $Base          = 'https://dev.artadan.ir'
)

$ErrorActionPreference = 'Stop'
$results = [ordered]@{ runAt = (Get-Date).ToString('s'); base = $Base }

function Invoke-Api {
  param([string]$Method, [string]$Path, [string]$Token, $Body, [hashtable]$ExtraHeaders = @{})
  $headers = @{}
  if ($Token) { $headers['Authorization'] = "Bearer $Token" }
  foreach ($k in $ExtraHeaders.Keys) { $headers[$k] = $ExtraHeaders[$k] }
  $params = @{ Method = $Method; Uri = "$Base$Path"; Headers = $headers; ContentType = 'application/json' }
  if ($null -ne $Body) { $params['Body'] = ($Body | ConvertTo-Json -Compress) }
  try {
    $res = Invoke-RestMethod @params
    return @{ status = 200; body = $res }
  } catch {
    $status = $null
    $respBody = $null
    try {
      $status = [int]$_.Exception.Response.StatusCode
      $stream = $_.Exception.Response.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream)
      $respBody = $reader.ReadToEnd()
    } catch {}
    return @{ status = $status; body = $respBody }
  }
}

function Get-OtpToken {
  param([string]$Phone)
  $request = Invoke-Api -Method 'POST' -Path '/api/mobile/auth/otp/request' -Body @{ phone = $Phone }
  $code = $request.body.debugCode
  if (-not $code) { throw "no debugCode for $Phone on $Base (is MOBILE_OTP_DEBUG=true on dev?)" }
  $verify = Invoke-Api -Method 'POST' -Path '/api/mobile/auth/otp/verify' -Body @{ phone = $Phone; code = $code }
  return $verify.body
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " NIR Phase 3 Live Contract Verification on $Base" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# ---------------------------------------------------------------- 1) Operator Login
Write-Host "`n[1/7] Testing Operator Login ($OperatorPhone)..."
$opAuth = Get-OtpToken -Phone $OperatorPhone
$opToken = $opAuth.accessToken
if ($opAuth.user.role -ne 'OPERATOR') { throw "Expected role OPERATOR but got $($opAuth.user.role)" }
Write-Host "  PASS: Operator authenticated, role = $($opAuth.user.role), userId = $($opAuth.user.id)" -ForegroundColor Green

# ---------------------------------------------------------------- 2) Operator Weighbridge
Write-Host "`n[2/7] Testing Operator Weighbridge Access..."
$opWb = Invoke-Api -Method 'GET' -Path '/api/mobile/operator/weighbridge' -Token $opToken
if ($opWb.status -ne 200) { throw "Operator weighbridge returned status $($opWb.status)" }
$ticketCount = if ($opWb.body.tickets) { @($opWb.body.tickets).Count } else { 0 }
Write-Host "  PASS: Operator weighbridge accessible, returned $ticketCount ticket(s)" -ForegroundColor Green

# ---------------------------------------------------------------- 3) Farmer Login
Write-Host "`n[3/7] Testing Farmer Login ($FarmerPhone)..."
$farmerAuth = Get-OtpToken -Phone $FarmerPhone
$farmerToken = $farmerAuth.accessToken
if ($farmerAuth.user.role -ne 'FARMER') { throw "Expected role FARMER but got $($farmerAuth.user.role)" }
Write-Host "  PASS: Farmer authenticated, role = $($farmerAuth.user.role), userId = $($farmerAuth.user.id)" -ForegroundColor Green

# ---------------------------------------------------------------- 4) Farmer Products
Write-Host "`n[4/7] Testing Farmer Feed Products Catalogue..."
$prodsRes = Invoke-Api -Method 'GET' -Path '/api/mobile/farmer/products' -Token $farmerToken
if ($prodsRes.status -ne 200) { throw "Farmer products returned status $($prodsRes.status)" }
$prods = @($prodsRes.body.products)
if ($prods.Count -eq 0) { throw "No feed products returned for farmer" }
Write-Host "  PASS: Received $($prods.Count) active feed product(s). First: $($prods[0].name) ($($prods[0].id))" -ForegroundColor Green

# ---------------------------------------------------------------- 5) Farmer Statement & Quota
Write-Host "`n[5/7] Testing Farmer Statement & Quota Calculation..."
$stmtRes = Invoke-Api -Method 'GET' -Path '/api/mobile/farmer/statement' -Token $farmerToken
if ($stmtRes.status -ne 200) { throw "Farmer statement returned status $($stmtRes.status)" }
$stmt = $stmtRes.body
$quotaTon = $stmt.summary.totalQuotaTon
$deliveredTon = $stmt.summary.totalDeliveredTon
$remainingTon = $stmt.summary.totalRemainingTon
$usagePct = $stmt.summary.overallUsagePercentage
Write-Host "  PASS: Statement calculated:" -ForegroundColor Green
Write-Host "        - Farmer: $($stmt.farmer.name) ($($stmt.farmer.id))"
Write-Host "        - Active Brood: $($stmt.activeBrood.name) (Flock: $($stmt.activeBrood.chickCount), Age: $($stmt.activeBrood.herdAgeDays) days)"
Write-Host "        - Quota: $quotaTon tons | Delivered: $deliveredTon tons | Remaining: $remainingTon tons ($usagePct%)"
Write-Host "        - Breakdown items: $(@($stmt.breakdown).Count) | Invoices: $(@($stmt.invoices).Count)"

# ---------------------------------------------------------------- 6) Farmer Order Placement & Idempotency
Write-Host "`n[6/7] Testing Farmer Order Placement (G-9) & Idempotency..."
$chosenProduct = $prods[0].id
$opId = "test_op_" + [System.Guid]::NewGuid().ToString('N').Substring(0, 12)
$orderPayload = @{
  productId = $chosenProduct
  requestedWeight = 11500
  targetDate = "1403/08/10"
  notes = "سفارش آزمون فاز ۳ زنده روی محیط dev"
}

$orderRes1 = Invoke-Api -Method 'POST' -Path '/api/mobile/farmer/orders' -Token $farmerToken -Body $orderPayload -ExtraHeaders @{ 'X-Operation-Id' = $opId }
if ($orderRes1.status -ne 200) { throw "Farmer order creation failed: $($orderRes1.body)" }
$createdOrder = $orderRes1.body.order
$orderId = $createdOrder.id
if (-not $orderId) { throw "Order response missing order id" }
Write-Host "  PASS: Order created successfully (ID: $orderId, Status: $($createdOrder.status), Weight: $($createdOrder.requestedWeight))" -ForegroundColor Green

# Test Idempotent Resubmission
$orderRes2 = Invoke-Api -Method 'POST' -Path '/api/mobile/farmer/orders' -Token $farmerToken -Body $orderPayload -ExtraHeaders @{ 'X-Operation-Id' = $opId }
if ($orderRes2.status -ne 200 -or $orderRes2.body.order.id -ne $orderId) {
  throw "Idempotency failed: expected order $orderId but got $($orderRes2.body)"
}
Write-Host "  PASS: Idempotent resubmission with same X-Operation-Id returned identical order $orderId without duplicate" -ForegroundColor Green

# ---------------------------------------------------------------- 7) Manager Cartable Verification
Write-Host "`n[7/7] Testing Manager Cartable (/api/mobile/manager/orders)..."
$mgrAuth = Get-OtpToken -Phone $ManagerPhone
$mgrToken = $mgrAuth.accessToken
$mgrOrders = Invoke-Api -Method 'GET' -Path '/api/mobile/manager/orders' -Token $mgrToken
if ($mgrOrders.status -ne 200) { throw "Manager orders cartable returned status $($mgrOrders.status)" }
$matching = @($mgrOrders.body.orders | Where-Object { $_.id -eq $orderId })
if ($matching.Count -eq 0) {
  throw "Order $orderId placed by farmer not visible in manager cartable!"
}
Write-Host "  PASS: Order $orderId is visible in manager cartable with status '$($matching[0].status)'" -ForegroundColor Green

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host " ALL PHASE 3 LIVE CONTRACT CHECKS PASSED ON DEV! (7/7)" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
