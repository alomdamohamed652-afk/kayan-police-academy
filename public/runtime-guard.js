(()=>{
  if(window.__KAYAN_RUNTIME_GUARD__)return;
  window.__KAYAN_RUNTIME_GUARD__=true;
  const nativeFetch=window.fetch.bind(window);
  const retryStatuses=new Set([408,425,429,500,502,503,504]);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const methodOf=(input,init)=>String(init?.method||(input instanceof Request?input.method:'GET')||'GET').toUpperCase();
  const urlOf=input=>{try{return new URL(input instanceof Request?input.url:String(input),location.href)}catch{return null}};
  const retryable=(input,init)=>{
    const method=methodOf(input,init);
    const url=urlOf(input);
    return (method==='GET'||method==='HEAD')&&url?.origin===location.origin&&url.pathname.startsWith('/api/');
  };
  window.fetch=async(input,init={})=>{
    const canRetry=retryable(input,init);
    const maxAttempts=canRetry?3:1;
    let lastError;
    for(let attempt=0;attempt<maxAttempts;attempt++){
      try{
        const response=await nativeFetch(input,init);
        if(!canRetry||!retryStatuses.has(response.status)||attempt===maxAttempts-1)return response;
        await sleep(450*(2**attempt)+Math.floor(Math.random()*180));
      }catch(error){
        lastError=error;
        if(!canRetry||attempt===maxAttempts-1)throw error;
        if(init?.signal?.aborted)throw error;
        await sleep(450*(2**attempt)+Math.floor(Math.random()*180));
      }
    }
    throw lastError||new Error('NETWORK_RETRY_FAILED');
  };

  const state={online:navigator.onLine};
  const paint=()=>{
    document.documentElement.dataset.network=state.online?'online':'offline';
    let badge=document.getElementById('kayan-network-state');
    if(state.online){badge?.remove();return}
    if(!badge){
      badge=document.createElement('div');
      badge.id='kayan-network-state';
      badge.setAttribute('role','status');
      badge.textContent='الاتصال بالإنترنت غير متاح — سيُعاد الاتصال تلقائيًا';
      document.body.appendChild(badge);
    }
  };
  addEventListener('online',()=>{state.online=true;paint();dispatchEvent(new CustomEvent('kayan:online'))});
  addEventListener('offline',()=>{state.online=false;paint()});
  addEventListener('DOMContentLoaded',paint,{once:true});

  addEventListener('unhandledrejection',event=>{
    const msg=String(event?.reason?.message||event?.reason||'');
    if(/ResizeObserver loop|AbortError/i.test(msg))return;
    console.error('[Kayan runtime] unhandled rejection:',event.reason);
  });
})();