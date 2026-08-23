import express from 'express';

const originalGet=express.application.get;
const originalPost=express.application.post;
const originalUse=express.application.use;
const originalStringify=JSON.stringify;

const captureData=value=>{
  if(value&&typeof value==='object'&&Array.isArray(value.batches)&&Array.isArray(value.evaluations)&&value.settings){
    globalThis.__kayanData=value;
  }
};

express.application.get=function(...args){
  globalThis.__kayanApp=this;
  return originalGet.apply(this,args);
};

express.application.use=function(...args){
  globalThis.__kayanApp=this;
  return originalUse.apply(this,args);
};

express.application.post=function(path,...handlers){
  globalThis.__kayanApp=this;
  if(path==='/api/evaluations'){
    handlers=handlers.map(handler=>async function evaluationWrapper(req,res,next){
      const d=globalThis.__kayanData;
      const selected=d?.settings?.evaluationBatchId?d.batches?.find(b=>b.id===d.settings.evaluationBatchId):null;
      const batch=selected||[...(d?.batches||[])].filter(b=>b.status==='closed').sort((a,b)=>new Date(b.endAt||b.createdAt||0)-new Date(a.endAt||a.createdAt||0))[0]||null;
      if(!batch)return handler(req,res,next);
      const touched=d.batches.map(item=>({item,status:item.status,toJSON:item.toJSON}));
      for(const item of d.batches){
        item.toJSON=function(){
          const snapshot={...this};
          const original=touched.find(x=>x.item===this);
          snapshot.status=original?.status??this.status;
          delete snapshot.toJSON;
          return snapshot;
        };
        item.status=item.id===batch.id?'open':'closed';
      }
      try{
        return await handler(req,res,next);
      }finally{
        for(const entry of touched){
          if(entry.toJSON)entry.item.toJSON=entry.toJSON;
          else delete entry.item.toJSON;
          entry.item.status=entry.status;
        }
      }
    });
  }
  return originalPost.call(this,path,...handlers);
};

JSON.stringify=function(value,replacer,space){
  captureData(value);
  return originalStringify.call(this,value,replacer,space);
};
