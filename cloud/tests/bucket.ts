export function memoryBucket() {
  const objects = new Map<string,{bytes:Uint8Array;contentType:string}>();
  const result = (key:string) => { const item=objects.get(key); return item?{key,size:item.bytes.length,httpMetadata:{contentType:item.contentType},body:new Blob([item.bytes as BlobPart]).stream()}:null; };
  const bucket={
    async head(key:string){return result(key);},
    async get(key:string,options?:{range?:{offset:number;length:number}}){const item=result(key);if(item&&options?.range){const bytes=objects.get(key)!.bytes.slice(options.range.offset,options.range.offset+options.range.length);item.body=new Blob([bytes]).stream();}return item;},
    async delete(key:string|string[]){for(const item of Array.isArray(key)?key:[key])objects.delete(item);},
    async list(options:{prefix?:string;limit?:number;cursor?:string}={}){
      const keys=[...objects.keys()].sort().filter(key=>key.startsWith(options.prefix||'')&&(!options.cursor||key>options.cursor));
      const page=keys.slice(0,options.limit||1000),truncated=page.length<keys.length;
      return {objects:page.map(key=>result(key)),truncated,...(truncated?{cursor:page.at(-1)}:{}),delimitedPrefixes:[]};
    },
    async createMultipartUpload(key:string,options:{httpMetadata:{contentType:string}}){
      const parts=new Map<number,Uint8Array>();
      return {
        async uploadPart(part:number,bytes:Uint8Array){parts.set(part,bytes.slice());return {partNumber:part,etag:`part-${part}`};},
        async complete(){const length=[...parts.values()].reduce((sum,b)=>sum+b.length,0);const bytes=new Uint8Array(length);let offset=0;for(const part of parts.values()){bytes.set(part,offset);offset+=part.length;}objects.set(key,{bytes,contentType:options.httpMetadata.contentType});return result(key);},
        async abort(){parts.clear();},
      };
    },
  } as unknown as R2Bucket;
  return {bucket,objects};
}
