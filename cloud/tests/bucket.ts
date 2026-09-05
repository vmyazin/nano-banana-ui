export function memoryBucket() {
  const objects = new Map<string,{bytes:Uint8Array;contentType:string}>();
  const result = (key:string) => { const item=objects.get(key); return item?{key,size:item.bytes.length,httpMetadata:{contentType:item.contentType},body:new Blob([item.bytes as BlobPart]).stream()}:null; };
  const bucket={
    async head(key:string){return result(key);},
    async get(key:string){return result(key);},
    async delete(key:string){objects.delete(key);},
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
