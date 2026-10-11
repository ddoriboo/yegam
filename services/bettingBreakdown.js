'use strict';
// Read-only grouping. All pooled totals, prices and payouts stay unchanged.
const PANEL_KEYS = Object.freeze(['number','counter','rookie','weather','deadline','baseball','cinema','economy','uncertainty','editor']);
const BREAKDOWN_SQL = `
 SELECT b.issue_id,
 CASE WHEN to_jsonb(u)->>'ai_panel_role' IN ('number','counter','rookie','weather','deadline','baseball','cinema','economy','uncertainty','editor') THEN 'aiPanelStats'
 WHEN NULLIF(to_jsonb(u)->>'ai_panel_role', '') IS NOT NULL OR LOWER(COALESCE(to_jsonb(u)->>'is_agent','false')) IN ('true','t','1') THEN 'externalAgentStats'
 ELSE 'humanStats' END AS participant_group,
 COUNT(DISTINCT b.user_id) AS participant_count, COUNT(*) AS bet_count,
 COALESCE(SUM(b.amount),0) AS total_volume,
 COALESCE(SUM(CASE WHEN LOWER(b.choice) = 'yes' THEN b.amount ELSE 0 END),0) AS yes_amount,
 COALESCE(SUM(CASE WHEN LOWER(b.choice) = 'no' THEN b.amount ELSE 0 END),0) AS no_amount
 FROM bets b LEFT JOIN users u ON u.id = b.user_id
 WHERE b.issue_id = ANY($1::integer[])
 GROUP BY b.issue_id, participant_group`;
function emptyStats() { return {participantCount:0,betCount:0,yesAmount:0,noAmount:0,totalVolume:0,yesRatio:null,noRatio:null}; }
function emptyBreakdown() { return {humanStats:emptyStats(),aiPanelStats:emptyStats(),externalAgentStats:emptyStats()}; }
function mapRows(rows) {
 const byIssue = new Map();
 for (const row of rows) {
  const id = Number(row.issue_id); if (!byIssue.has(id)) byIssue.set(id, emptyBreakdown());
  if (!Object.hasOwn(byIssue.get(id), row.participant_group)) continue;
  const number = key => Number(row[key]) || 0;
  const yesAmount = number('yes_amount'), noAmount = number('no_amount'), totalVolume = number('total_volume');
  const pool = yesAmount + noAmount;
  byIssue.get(id)[row.participant_group] = {participantCount:number('participant_count'),betCount:number('bet_count'),yesAmount,noAmount,totalVolume,yesRatio:pool > 0 ? yesAmount / pool * 100 : null,noRatio:pool > 0 ? noAmount / pool * 100 : null};
 }
 return byIssue;
}
async function loadBreakdowns(query, issueIds) {
 const ids = [...new Set(issueIds.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
 if (!ids.length) return new Map();
 const result = await query(BREAKDOWN_SQL, [ids]); return mapRows(result.rows);
}
module.exports = {PANEL_KEYS,BREAKDOWN_SQL,emptyStats,emptyBreakdown,mapRows,loadBreakdowns};
