'use strict';
// Provider dispatch deliberately preserves every existing Upbit-v1 primitive.
const legacy = require('./marketResolutionRule');
const { resolveUpbit } = require('./upbitResolution');
const official = require('./officialResolutionRules');
const { resolveOfficial } = require('./officialResolution');
const DEFINITIONS = Object.freeze([
  Object.freeze({ provider:'upbit',version:1,category:'코인',flag:'AUTO_RESOLVE_UPBIT' }),
  Object.freeze({ provider:'awc_metar',version:2,category:'날씨',flag:'AUTO_RESOLVE_OFFICIAL' }),
  Object.freeze({ provider:'us_treasury',version:2,category:'경제',flag:'AUTO_RESOLVE_OFFICIAL' })
]);
function definition(rule){const d=DEFINITIONS.find(d=>d.provider===rule?.provider&&d.version===rule?.version);if(!d)throw Object.assign(new TypeError('Unsupported official provider'),{code:'UNSUPPORTED_PROVIDER'});return d;}
function validateRule(rule,issue){definition(rule);return rule.provider==='upbit'?legacy.validateResolutionRule(rule,issue):official.validateOfficialRule(rule,issue);}
function ruleKey(rule){const r=validateRule(rule);return r.provider==='upbit'?require('../database/settlement-schema').resolutionKey(r):official.officialRuleKey(r);}
function resolveRule(rule,options){const r=validateRule(rule);return r.provider==='upbit'?resolveUpbit(r,options):resolveOfficial(r,options);}
function providerEnabled(rule,{upbit=process.env.AUTO_RESOLVE_UPBIT==='true',official:enabled=process.env.AUTO_RESOLVE_OFFICIAL==='true'}={}){definition(rule);return rule.provider==='upbit'?Boolean(upbit):Boolean(enabled);}
function providerStatus(flags){return DEFINITIONS.map(d=>({...d,enabled:providerEnabled(d,flags)}));}
function officialDescription(rule,issue){
 const r=official.validateOfficialRule(rule,issue);
 return official.officialPublicText(r)+'\n\n베팅 마감: '+new Date(issue.betting_end_date).toISOString()+' UTC\n결과 조회 시작: '+r.observation_at+' UTC\n\n서버가 공식 자료로 자동 판정하고 단일 트랜잭션으로 GAM을 정산합니다. 자료/서버 장애 시 지연될 수 있습니다. 초기 50%는 동일한 시작값으로 실제 확률이 아닙니다. GAM은 환전·현금화할 수 없으며 투자 권유가 아닙니다.';
}
function publicCriteria(rule,issue){
 const r=validateRule(rule,issue);
 if(r.provider==='upbit'){
  const prices=[...issue.title.matchAll(/(?<![\d.,])([1-9]\d*(?:,\d{3})*)\s*원/g)];
  if(prices.length>1||(prices.length===1&&Number(prices[0][1].replace(/,/g,''))!==r.threshold))throw new TypeError('Title threshold mismatch');
  const parsed=legacy.inferLegacyRule(issue);
  if(!parsed||JSON.stringify(parsed)!==JSON.stringify(r))throw new TypeError('Public criteria and stored rule disagree');
 }else{
  if(issue.category!==official.ruleCategory(r)||issue.title!==official.officialTitle(r))throw new TypeError('Canonical category/title required');
  if(issue.description!==officialDescription(r,issue))throw new TypeError('Exact canonical official description required; commentary belongs in separate analysis posts');
  const key=official.officialRuleKey(r);
  if(issue.description.split(key).length!==2||(issue.description.match(/YEGAM-/g)||[]).length!==1)throw new TypeError('Single canonical identity required');
 }
 return r;
}
function assertPublishable(rule,issue,{now=Date.now()}={}){
 const r=publicCriteria(rule,issue);
 if(r.provider!=='upbit'){
  if(!providerEnabled(r))throw Object.assign(new Error('Official source not enabled'),{code:'PROVIDER_DISABLED'});
  if(!Number.isSafeInteger(now)||Date.parse(issue.betting_end_date)<=now+3*60*60*1000)throw new TypeError('At least three future betting hours required');
 }
 return r;
}
function resolutionReason(rule,decision){
 const r=validateRule(rule);
 if(r.provider==='upbit')return decision.status==='Cancelled'
  ?`업비트 고정 1분봉 자료를 기준 시각 이후 24시간 내 확인하지 못해 취소합니다. ${decision.reason||''}`
  :`업비트 ${r.market} ${decision.evidence.candle_open_at} 1분봉 종가 ${decision.evidence.close}원, 기준 ${r.threshold}원 초과 여부: ${decision.status}.`;
 if(decision.status==='Cancelled')return `선언한 공식 자료를 판정 기준 시각 이후 24시간 내 확인하지 못해 GAM 원금을 환불합니다. ${decision.reason||''}`;
 if(r.provider==='awc_metar')return `NOAA AWC ${r.station} ${r.observation_at} 정확한 관측 기온 ${decision.evidence.temp}°C, 기준 ${r.threshold}°C 초과 여부: ${decision.status}.`;
 return `미 재무부 ${r.event_date} 공식 10년물 파수익률 ${decision.evidence.value_percent}% (${decision.evidence.value_bp}bp), 기준 ${r.threshold_bp}bp 초과 여부: ${decision.status}. 이 정산에 성공적으로 기록된 값을 고정합니다.`;
}
module.exports={DEFINITIONS,validateRule,ruleKey,resolveRule,providerEnabled,providerStatus,officialDescription,publicCriteria,assertPublishable,resolutionReason};
