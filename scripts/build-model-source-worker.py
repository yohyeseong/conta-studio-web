"""Bundle verified model source modules without changing their data checks."""
import pathlib,re,sys
root=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'docs/model')
def module(name,exports,prefix=''):
    s=(root/name).read_text(encoding='utf-8')
    s=re.sub(r'^import .*?;\s*','',s,flags=re.M)
    s=s.replace('export async function','async function').replace('export function','function').replace('export const','const')
    return '(()=>{'+prefix+s+'\nreturn {'+','.join(exports)+'};})();\n'
bundle='// Generated from the verified source modules; preserve validation and geometry.\n'+(root/'vendor/polygon-clipping.js').read_text(encoding='utf-8')+'\n'+(root/'military-policy.js').read_text(encoding='utf-8')+'\n'
bundle+='const modelSource='+module('model-packed.js',['packedModel','modelMetadata'])
bundle+='const officialSource='+module('official-packed.js',['officialFeatures','officialMetadata','VERSION'])
bundle+='const details='+module('official-details.js',['addOfficialDetails'],'const {officialFeatures,VERSION}=officialSource;')
bundle+="""onmessage=async e=>{const {id,bounds,geo}=e.data;try{if(!(bounds[0]>=124&&bounds[1]>=33&&bounds[2]<=132&&bounds[3]<=39))throw Error('전국 데이터 범위 밖입니다.');if(geo==='prepare'){await Promise.all([modelSource.modelMetadata(bounds),officialSource.officialMetadata(bounds)]);postMessage({id,source:{ready:true}});return;}const official=officialSource.officialFeatures(bounds).then(value=>({value}),error=>({error})),base=await modelSource.packedModel(bounds,(message,progress)=>postMessage({id,message,progress})),result=await official;if(result.error)throw result.error;const source=await details.addOfficialDetails(base,bounds,result.value);MilitaryPolicy.assertPrepared(source,bounds);postMessage({id,source});}catch(error){postMessage({id,error:error.message});}};
"""
(root/'model-source-worker.js').write_text(bundle,encoding='utf-8')
print('Verified model worker bundle:',len(bundle.encode()),'bytes')
