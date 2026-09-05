export function byteRange(value:string|null,size:number):{offset:number;length:number}|'invalid'|null {
  if(!value)return null;
  const match=value.match(/^bytes=(\d*)-(\d*)$/);
  if(!match||(!match[1]&&!match[2]))return 'invalid';
  if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return 'invalid';const length=Math.min(size,suffix);return {offset:size-length,length};}
  const offset=Number(match[1]),end=match[2]?Math.min(Number(match[2]),size-1):size-1;
  if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(end)||offset<0||offset>=size||end<offset)return 'invalid';
  return {offset,length:end-offset+1};
}
