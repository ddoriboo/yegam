'use strict';
const {fetchWeatherReference,fetchTreasuryReference}=require('./officialResolution');
const {validateOfficialRule,officialRuleKey,officialPublicText,officialTitle,ruleCategory,treasuryDateStartUtc}=require('./officialResolutionRules');
const {providerEnabled,officialDescription}=require('./resolutionProviders');
const DAY=86400000,HOUR=3600000;
function dateString(time){return new Date(time).toISOString().slice(0,10);}
function shiftDate(date,days){return dateString(Date.parse(date+'T00:00:00.000Z')+days*DAY);}
function observed(date){const d=new Date(date+'T00:00:00.000Z'),w=d.getUTCDay();return shiftDate(date,w===6?-1:w===0?1:0);}
function nthMonday(y,m,n){const first=new Date(Date.UTC(y,m-1,1));return dateString(first.getTime()+((8-first.getUTCDay())%7+(n-1)*7)*DAY);}
function holiday(date){
 const y=Number(date.slice(0,4));const set=new Set();
 for(const year of[y-1,y,y+1])for(const mmdd of['01-01','06-19','07-04','11-11','12-25'])set.add(observed(year+'-'+mmdd));
 set.add(nthMonday(y,1,3));set.add(nthMonday(y,2,3));set.add(nthMonday(y,9,1));set.add(nthMonday(y,10,2));
 const mayLast=new Date(Date.UTC(y,5,0));set.add(dateString(mayLast.getTime()-((mayLast.getUTCDay()+6)%7)*DAY));
 const novFirst=new Date(Date.UTC(y,10,1));set.add(dateString(novFirst.getTime()+((11-novFirst.getUTCDay())%7+21)*DAY));
 // Gregorian Easter, then Good Friday. This is conservative filtering,
 // not a Treasury guarantee; unexpected non-publication still voids safely.
 const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);const month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;set.add(dateString(Date.UTC(y,month-1,day)-2*DAY));
 return set.has(date);
}
function slotTimestamp(slot,now){
 if(typeof slot!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/.test(slot))throw new TypeError('Canonical whole-hour slot required');
 const t=Date.parse(slot);if(!Number.isSafeInteger(t)||new Date(t).toISOString()!==slot||!['00','09'].includes(slot.slice(11,13))||Math.abs(t-now)>DAY)throw new TypeError('Current 09/18 KST slot required');return t;
}
function candidate(rule,bet){
 const dates={end_date:rule.observation_at,betting_end_date:bet};
 const r=validateOfficialRule(rule,dates);
 return{resolution_key:officialRuleKey(r),payload:{title:officialTitle(r),category:ruleCategory(r),description:officialDescription(r,dates),...dates,image_url:'',yes_price:50,is_popular:false,resolution_params:r}};
}
async function planOfficial(provider,slot,{now=Date.now(),weatherReference=fetchWeatherReference,treasuryReference=fetchTreasuryReference}={}){
 if(!Number.isSafeInteger(now))throw new TypeError('Valid planning clock required');const slotTime=slotTimestamp(slot,now);
 if(provider!=='awc_metar'&&provider!=='us_treasury')throw new TypeError('Unsupported planning provider');
 const data=await(provider==='awc_metar'?weatherReference():treasuryReference());
 if(!data?.reference)return{provider,status:'blocked',reason:data?.reason||'missing_reference',candidates:[]};
 const ref=data.reference;if(!Number.isFinite(Date.parse(ref.retrieved_at))||Math.abs(now-Date.parse(ref.retrieved_at))>5*60000)throw new TypeError('Fresh reference retrieval required');
 const candidates=[];
 if(provider==='awc_metar'){
  const obs=slotTime+DAY,bet=obs-6*HOUR;if(bet<=now+3*HOUR)return{provider,status:'blocked',reason:'betting_window_too_short',candidates:[]};
  const threshold=Math.round(ref.temp)+1;
  candidates.push(candidate({version:2,provider,station:'RKSI',metric:'temperature_c',operator:'gt',threshold,observation_at:new Date(obs).toISOString(),missing_data_policy:'cancel_after_24h'},new Date(bet).toISOString(),ref));
 }else{
  for(let offset=0;offset<22&&candidates.length<8;offset++){
   const date=dateString(now+offset*DAY),weekday=new Date(date+'T00:00:00.000Z').getUTCDay();
   if(weekday===0||weekday===6||holiday(date))continue;
   const bet=treasuryDateStartUtc(shiftDate(date,-1));if(bet<=now+3*HOUR)continue;
   const obs=treasuryDateStartUtc(shiftDate(date,1))+18*HOUR;
   candidates.push(candidate({version:2,provider,series:'BC_10YEAR',metric:'par_yield_basis_points',operator:'gt',threshold_bp:ref.value_bp+5,event_date:date,observation_at:new Date(obs).toISOString(),missing_data_policy:'cancel_after_24h'},new Date(bet).toISOString(),ref));
  }
 }
 return{provider,status:candidates.length?'ready':'blocked',enabled:providerEnabled({provider,version:2}),reference:ref,candidates};
}
module.exports={planOfficial,holiday};
