'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');

function failure(res,error) {
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 ? error.status : 503;
    return res.status(status).json({success:false,code:status<500 ? (error.code || 'INVALID_PANEL_REQUEST') : 'PANEL_UNAVAILABLE',message:status<500 ? error.message : '공식 AI 패널 상태를 확인할 수 없습니다. 잠시 후 확인하세요.'});
}
function createPublicPanelRouter(dependencies={}) {
    const router=express.Router();
    router.get('/',async(req,res)=>{
        try {
            const getStatus=dependencies.getPanelStatus || require('../services/officialPanelAccounts').getPanelStatus;
            const status=await getStatus();
            res.set('Cache-Control','no-store');
            res.json({success:true,...status});
        } catch(error) { failure(res,error); }
    });
    return router;
}
function createAdminPanelRouter(dependencies={}) {
    const router=express.Router();
    const requireRole=dependencies.requireRole || require('../middleware/admin-auth-secure').requireAdminRole;
    // Server mounts this router inside its secureAdminMiddleware boundary.
    router.use(requireRole('super_admin'));
    router.use(rateLimit({windowMs:60000,limit:30,standardHeaders:'draft-7',legacyHeaders:false}));
    router.get('/status',async(req,res)=>{
        try {
            const getStatus=dependencies.getPanelStatus || require('../services/officialPanelAccounts').getPanelStatus;
            const settlement=dependencies.settlement || require('../services/automaticSettlement');
            res.json({success:true,...await getStatus(),settlement:settlement.getStatus()});
        } catch(error) { failure(res,error); }
    });
    router.post('/enroll',async(req,res)=>{
        if (!req.body || req.body.confirm!=='ENROLL_OFFICIAL_AI_PANEL_10' || Object.keys(req.body).some(k=>k!=='confirm')) return res.status(400).json({success:false,code:'CONFIRM_REQUIRED',message:'고정된 공식 패널 10명·각 1000 GAM 등록 확인이 필요합니다.'});
        try {
            const enroll=dependencies.enrollPanel || require('../services/officialPanelAccounts').enrollPanel;
            res.json({success:true,...await enroll({adminId:req.admin.id})});
        } catch(error) { failure(res,error); }
    });
    router.post('/bets',async(req,res)=>{
        const allowed=new Set(['personaKey','issueId','choice','amount','rationale','evidenceAt','sourceUrls','expectedResolutionKey']);
        if(!req.body || Object.keys(req.body).some(k=>!allowed.has(k))) return res.status(400).json({success:false,code:'INVALID_FIELDS',message:'허용된 패널 베팅 필드만 전달하세요.'});
        try {
            const place=dependencies.placePanelBet || require('../services/officialPanelBet').placePanelBet;
            const result=await place(req.body,{actorAdminId:req.admin.id});
            res.json({success:true,...result});
        } catch(error) { failure(res,error); }
    });
    return router;
}
module.exports={createAdminPanelRouter,createPublicPanelRouter};
