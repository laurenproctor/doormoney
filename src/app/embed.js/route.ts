import { SITE } from "@/lib/site";

/**
 * The one-line loader an act pastes into their site:
 *   <script src="https://<domain>/embed.js" data-act="gutter-hymns"></script>
 * It injects an iframe pointing at /embed/<act> and resizes it from postMessage.
 * It never touches payment. Everything sensitive happens inside the iframe, on our origin.
 */
export async function GET() {
  const js = `(function(){
  var s=document.currentScript;if(!s)return;
  var act=s.getAttribute("data-act");if(!act)return;
  var f=document.createElement("iframe");
  f.src=${JSON.stringify(SITE.url)}+"/embed/"+encodeURIComponent(act);
  f.title="Back "+act+" on Door Money";
  f.style.cssText="width:100%;max-width:420px;height:560px;border:0;display:block";
  f.setAttribute("allow","payment");
  f.setAttribute("loading","lazy");
  s.parentNode.insertBefore(f,s.nextSibling);
  window.addEventListener("message",function(e){
    if(e.source!==f.contentWindow)return;
    var d=e.data||{};if(d.type==="doormoney:height"&&d.height){f.style.height=d.height+"px";}
  });
})();`;
  return new Response(js, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
