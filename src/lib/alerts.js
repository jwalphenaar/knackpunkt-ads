function parseDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  const normalized = String(value).includes('T') ? new Date(value) : new Date(`${value}T12:00:00`)
  return Number.isNaN(normalized.getTime()) ? null : normalized
}

function daysBetween(from, to) {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.ceil((to - from) / msPerDay)
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + Number(row?.[key] || 0), 0)
}

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase()
}

function isActiveCampaignStatus(status) {
  const normalized = normalizeStatus(status)
  return normalized === 'ACTIVE' || normalized === 'RUNNABLE'
}

function isAccountServingStatus(account, target) {
  return Array.isArray(account?.serving_statuses) && account.serving_statuses.includes(target)
}

function getCampaignAnalyticsById(analytics) {
  const map = new Map()
  for (const row of analytics || []) {
    const key = String(row?.campaign_id || '')
    if (!key) continue
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(row)
  }
  return map
}

function getRecentWindow(rows, days, now = new Date()) {
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - days)
  return rows.filter((row) => {
    const date = parseDate(row?.date_start)
    return date && date >= cutoff
  })
}

function makeAlert({
  scope,
  severity,
  code,
  title,
  detail,
  account,
  campaign = null,
  metric = null,
}) {
  return {
    id: `${scope}:${account?.id || 'na'}:${campaign?.id || 'na'}:${code}`,
    scope,
    severity,
    code,
    title,
    detail,
    metric,
    account_id: account?.id || null,
    account_name: account?.name || `Account ${account?.id || ''}`,
    campaign_id: campaign?.id || null,
    campaign_name: campaign?.name || null,
    campaign_status: campaign?.status || null,
  }
}

function buildAccountLevelAlerts(account) {
  const alerts = []

  if (isAccountServingStatus(account, 'BILLING_HOLD')) {
    alerts.push(makeAlert({
      scope: 'account',
      severity: 'critical',
      code: 'account_billing_hold',
      title: 'Account staat op billing hold',
      detail: 'Campagnes kunnen stoppen door betaalprobleem of facturatieblokkade.',
      account,
    }))
  }

  if (isAccountServingStatus(account, 'ACCOUNT_END_DATE_HOLD')) {
    alerts.push(makeAlert({
      scope: 'account',
      severity: 'warning',
      code: 'account_end_date_hold',
      title: 'Account heeft een end date hold',
      detail: 'Delivery kan stoppen omdat de account-einddatum is bereikt.',
      account,
    }))
  }

  return alerts
}

function buildCampaignLevelAlerts(account, campaign, analyticsRows, now = new Date(), options = {}) {
  const { includeBudgetAlerts = true } = options
  const alerts = []
  const recent3 = getRecentWindow(analyticsRows, 3, now)
  const recent7 = getRecentWindow(analyticsRows, 7, now)
  const previous14 = getRecentWindow(analyticsRows, 14, now)
  const previous7 = previous14.filter((row) => {
    const date = parseDate(row?.date_start)
    if (!date) return false
    const daysAgo = daysBetween(date, now)
    return daysAgo > 7 && daysAgo <= 14
  })

  const recent3Impressions = sum(recent3, 'impressions')
  const recent3Spend = sum(recent3, 'cost_in_local_currency')
  const recent7Impressions = sum(recent7, 'impressions')
  const recent7Clicks = sum(recent7, 'clicks')
  const recent7Spend = sum(recent7, 'cost_in_local_currency')
  const prev7Impressions = sum(previous7, 'impressions')
  const prev7Clicks = sum(previous7, 'clicks')
  const totalSpend = sum(analyticsRows, 'cost_in_local_currency')

  const totalBudget = Number(campaign?.total_budget_amount || 0)
  const runScheduleEnd = parseDate(campaign?.run_schedule_end)

  if (isActiveCampaignStatus(campaign?.status) && recent3Impressions === 0 && recent3Spend === 0) {
    alerts.push(makeAlert({
      scope: 'campaign',
      severity: 'warning',
      code: 'campaign_no_recent_delivery',
      title: 'Actieve campagne zonder delivery in laatste 3 dagen',
      detail: 'Geen impressions en geen spend in de laatste 3 dagen.',
      account,
      campaign,
    }))
  }

  if (isActiveCampaignStatus(campaign?.status) && prev7Impressions >= 1000 && recent7Impressions <= prev7Impressions * 0.3) {
    alerts.push(makeAlert({
      scope: 'campaign',
      severity: 'warning',
      code: 'campaign_impression_drop',
      title: 'Impressions zijn sterk teruggevallen',
      detail: `Laatste 7 dagen: ${Math.round(recent7Impressions).toLocaleString('nl-NL')} vs vorige 7 dagen: ${Math.round(prev7Impressions).toLocaleString('nl-NL')}.`,
      account,
      campaign,
      metric: 'impressions',
    }))
  }

  if (isActiveCampaignStatus(campaign?.status) && prev7Clicks >= 25 && recent7Clicks <= prev7Clicks * 0.3) {
    alerts.push(makeAlert({
      scope: 'campaign',
      severity: 'warning',
      code: 'campaign_click_drop',
      title: 'Clicks zijn sterk teruggevallen',
      detail: `Laatste 7 dagen: ${Math.round(recent7Clicks).toLocaleString('nl-NL')} vs vorige 7 dagen: ${Math.round(prev7Clicks).toLocaleString('nl-NL')}.`,
      account,
      campaign,
      metric: 'clicks',
    }))
  }

  if (includeBudgetAlerts) {
    if (totalBudget > 0 && totalSpend >= totalBudget) {
      alerts.push(makeAlert({
        scope: 'campaign',
        severity: 'critical',
        code: 'campaign_budget_exhausted',
        title: 'Campagnebudget bereikt of overschreden',
        detail: `Spend ${totalSpend.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} op budget ${totalBudget.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
        account,
        campaign,
        metric: 'budget',
      }))
    } else if (totalBudget > 0 && totalSpend >= totalBudget * 0.9) {
      alerts.push(makeAlert({
        scope: 'campaign',
        severity: 'warning',
        code: 'campaign_budget_nearly_exhausted',
        title: 'Campagnebudget bijna op',
        detail: `Spend zit op ${Math.round((totalSpend / totalBudget) * 100)}% van het totaalbudget.`,
        account,
        campaign,
        metric: 'budget',
      }))
    }
  }

  if (runScheduleEnd) {
    const daysLeft = daysBetween(now, runScheduleEnd)
    if (daysLeft < 0 && isActiveCampaignStatus(campaign?.status)) {
      alerts.push(makeAlert({
        scope: 'campaign',
        severity: 'critical',
        code: 'campaign_end_date_passed',
        title: 'Campagne voorbij einddatum maar nog actief',
        detail: `Einddatum ${runScheduleEnd.toLocaleDateString('nl-NL')}.`,
        account,
        campaign,
      }))
    } else if (daysLeft >= 0 && daysLeft <= 3) {
      alerts.push(makeAlert({
        scope: 'campaign',
        severity: 'warning',
        code: 'campaign_end_date_near',
        title: 'Campagne eindigt binnen 3 dagen',
        detail: `Einddatum ${runScheduleEnd.toLocaleDateString('nl-NL')}.`,
        account,
        campaign,
      }))
    }
  }

  if (normalizeStatus(campaign?.status) === 'COMPLETED' && recent7Spend > 0) {
    alerts.push(makeAlert({
      scope: 'campaign',
      severity: 'info',
      code: 'campaign_completed_with_recent_spend',
      title: 'Campagne staat op completed maar had recente spend',
      detail: 'Controleer of de status en delivery nog logisch synchroon lopen.',
      account,
      campaign,
    }))
  }

  return alerts
}

export function buildAlerts({ accounts = [], campaigns = [], analytics = [], accountId = null, now = new Date(), includeBudgetAlerts = true }) {
  const alerts = []
  const campaignAnalytics = getCampaignAnalyticsById(analytics)
  const accountMap = new Map(accounts.map((account) => [String(account.id), account]))

  const relevantCampaigns = accountId
    ? campaigns.filter((campaign) => String(campaign.account_id) === String(accountId))
    : campaigns

  const relevantAccounts = accountId
    ? accounts.filter((account) => String(account.id) === String(accountId))
    : accounts

  for (const account of relevantAccounts) {
    alerts.push(...buildAccountLevelAlerts(account))
  }

  for (const campaign of relevantCampaigns) {
    const account = accountMap.get(String(campaign.account_id))
    if (!account) continue
    const rows = campaignAnalytics.get(String(campaign.id)) || []
    alerts.push(...buildCampaignLevelAlerts(account, campaign, rows, now, { includeBudgetAlerts }))
  }

  const severityRank = { critical: 0, warning: 1, info: 2 }
  return alerts.sort((a, b) => {
    const severityDelta = (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9)
    if (severityDelta !== 0) return severityDelta
    if (a.account_name !== b.account_name) return a.account_name.localeCompare(b.account_name)
    return String(a.campaign_name || '').localeCompare(String(b.campaign_name || ''))
  })
}

export function summarizeAlerts(alerts = []) {
  return alerts.reduce((acc, alert) => {
    acc.total += 1
    acc[alert.severity] = (acc[alert.severity] || 0) + 1
    return acc
  }, { total: 0, critical: 0, warning: 0, info: 0 })
}
