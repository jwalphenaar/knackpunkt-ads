function normalizeValue(v) {
  return String(v || '').trim().toUpperCase()
}

function extractFacetKeysFromString(input) {
  const keys = []
  const regex = /urn:li:adTargetingFacet:([a-zA-Z]+)/g
  let match
  while ((match = regex.exec(String(input || ''))) !== null) {
    keys.push(match[1])
  }
  return keys
}

function collectFacetKeys(node, set) {
  if (node == null) return
  if (Array.isArray(node)) {
    node.forEach((item) => collectFacetKeys(item, set))
    return
  }
  if (typeof node === 'string') {
    extractFacetKeysFromString(node).forEach((k) => set.add(k))
    return
  }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      const m = k.match(/^urn:li:adTargetingFacet:([a-zA-Z]+)$/)
      if (m) set.add(m[1])
      collectFacetKeys(v, set)
    }
  }
}

function hasFacet(targetingCriteria, facetKey) {
  const key = String(facetKey || '').toLowerCase()
  const facets = getTargetingFacetKeys(targetingCriteria).map((f) => f.toLowerCase())
  return facets.includes(key)
}

export function getTargetingFacetKeys(targetingCriteria) {
  const set = new Set()
  collectFacetKeys(targetingCriteria, set)
  return [...set]
}

export function getCampaignRedFlags(campaign) {
  const flags = []
  const creativeSelection = normalizeValue(campaign?.creative_selection)
  const costType = normalizeValue(campaign?.cost_type)
  const lang = normalizeValue(campaign?.locale_language)
  const country = normalizeValue(campaign?.locale_country)
  const targeting = campaign?.targeting_criteria || null
  const facets = getTargetingFacetKeys(targeting)
  const criteriaFacets = facets.filter((facet) => {
    const f = String(facet || '').toLowerCase()
    if (f === 'interfacelocales' || f === 'languages') return false
    if (f === 'locations' || f === 'geolocations' || f === 'profilelocations') return false
    return true
  })

  if (creativeSelection !== 'OPTIMIZED') {
    flags.push({
      code: 'ad_selection_not_optimized',
      label: 'Ad selection niet OPTIMIZED',
      detail: `creative_selection=${campaign?.creative_selection || 'onbekend'}`,
      severity: 'critical',
    })
  }

  if (campaign?.audience_expansion_enabled === true) {
    flags.push({
      code: 'audience_expansion_on',
      label: 'Audience expansion staat aan',
      detail: 'audience_expansion_enabled=true',
      severity: 'critical',
    })
  }

  if (campaign?.off_platform_delivery_enabled === true) {
    flags.push({
      code: 'off_platform_delivery_on',
      label: 'Off-platform delivery staat aan',
      detail: 'off_platform_delivery_enabled=true',
      severity: 'critical',
    })
  }

  if (costType.includes('MAXIMUM_DELIVERY')) {
    flags.push({
      code: 'maximum_delivery_bid',
      label: 'Bidding op Maximum Delivery',
      detail: `cost_type=${campaign?.cost_type}`,
      severity: 'critical',
    })
  }

  if (hasFacet(targeting, 'skills')) {
    flags.push({
      code: 'targeting_skills_used',
      label: 'Skills gebruikt in targeting',
      detail: 'urn:li:adTargetingFacet:skills',
      severity: 'critical',
    })
  }

  if (hasFacet(targeting, 'interests')) {
    flags.push({
      code: 'targeting_interests_used',
      label: 'Member Interests gebruikt in targeting',
      detail: 'urn:li:adTargetingFacet:interests',
      severity: 'critical',
    })
  }

  if (criteriaFacets.length > 4) {
    flags.push({
      code: 'too_many_targeting_facets',
      label: 'Meer dan 4 targeting criteria',
      detail: `criteria=${criteriaFacets.length} (excl. taal/locatie)`,
      severity: 'warning',
    })
  }

  if (!(lang === 'EN' && country === 'US')) {
    flags.push({
      code: 'locale_not_en_us',
      label: 'Campagne taal is niet en_US',
      detail: `locale=${campaign?.locale_language || '-'}_${campaign?.locale_country || '-'}`,
      severity: 'critical',
    })
  }

  return flags
}
