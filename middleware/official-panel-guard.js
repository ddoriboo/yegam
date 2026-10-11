'use strict';
async function isOfficialPanelUser(userId, queryImpl) {
  if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0) return false;
  const query = queryImpl || require('../database/postgres').query;
  const result = await query("SELECT (to_jsonb(u)->>'ai_panel_role') IS NOT NULL AS is_panel FROM users u WHERE id=$1", [Number(userId)]);
  return result.rows[0]?.is_panel === true;
}
function rejectPanelRewardTarget(queryImpl) {
  return async (req,res,next,userId) => {
    if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
    try {
      if (await isOfficialPanelUser(userId,queryImpl)) return res.status(403).json({success:false,code:'OFFICIAL_AI_ACCOUNT_RESTRICTED',message:'공식 AI 패널은 별도 보상·충전·소비 경로를 사용할 수 없습니다.'});
      return next();
    } catch (_) { return res.status(503).json({success:false,message:'계정 보호 상태를 확인할 수 없습니다.'}); }
  };
}
module.exports={isOfficialPanelUser,rejectPanelRewardTarget};
