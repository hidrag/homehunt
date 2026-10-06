import mongoose from 'mongoose';
import * as service from '../services/visit.service.js';
const fail=(res,e)=>res.status(e.status||500).json({success:false,error:{code:e.code||'INTERNAL_SERVER_ERROR',message:e.message||'Unexpected error'}});
const paging=q=>[Math.max(1,parseInt(q.page,10)||1),Math.min(50,Math.max(1,parseInt(q.limit,10)||10))];
// Status filters are whitelist-only: unknown values are ignored, never
// interpolated into a database query.
const VISIT_STATUSES=['pending','confirmed','declined','cancelled','completed'];
const statusFilter=q=>VISIT_STATUSES.includes(q.status)?{status:q.status}:{};
export const create=async(req,res)=>{try{return res.status(201).json({success:true,data:{visit:await service.create(req.user.id,req.body)}})}catch(e){return fail(res,e)}};
export const mine=async(req,res)=>{try{const [p,l]=paging(req.query);return res.json({success:true,data:await service.list({buyer:req.user.id,...statusFilter(req.query)},p,l)})}catch(e){return fail(res,e)}};
export const agent=async(req,res)=>{try{const [p,l]=paging(req.query);return res.json({success:true,data:await service.list({agent:req.user.id,...statusFilter(req.query)},p,l)})}catch(e){return fail(res,e)}};
export const status=async(req,res)=>{try{return res.json({success:true,data:{visit:await service.transition(req.params.id,req.user.id,req.user.role,req.body?.status)}})}catch(e){return fail(res,e)}};
export const adminList=async(req,res)=>{try{const [p,l]=paging(req.query);const filter={};if(['pending','confirmed','declined','cancelled','completed'].includes(req.query.status))filter.status=req.query.status;if(req.query.agent){if(!mongoose.isValidObjectId(req.query.agent))return fail(res,{status:400,code:'INVALID_ID',message:'Invalid agent id'});filter.agent=req.query.agent;}return res.json({success:true,data:await service.list(filter,p,l)})}catch(e){return fail(res,e)}};
export const adminStatus=async(req,res)=>{try{return res.json({success:true,data:{visit:await service.transition(req.params.id,req.user.id,'admin',req.body?.status)}})}catch(e){return fail(res,e)}};
