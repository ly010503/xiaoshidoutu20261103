const escapeXml = (value) => String(value).replace(/[<>&"']/g, (char) => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;' }[char]));

function download(blob, name) { const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500); }

export function createPatternSvg(pattern, palette, settings = {}) {
  const cell = Number(settings.cellSize || 20), margin = settings.coordinates ? Math.max(28, cell) : 0;
  const width = pattern.width * cell + margin * 2, height = pattern.height * cell + margin * 2;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,`<rect width="100%" height="100%" fill="${settings.background === 'transparent' ? 'none' : '#fff'}"/>`];
  parts.push('<g id="beads" shape-rendering="crispEdges">');
  for (let y=0;y<pattern.height;y+=1) for(let x=0;x<pattern.width;x+=1){const color=palette[pattern.indices[y*pattern.width+x]];parts.push(`<rect x="${margin+x*cell}" y="${margin+y*cell}" width="${cell}" height="${cell}" fill="${color.hex}" data-code="${escapeXml(color.code)}"/>`)}
  parts.push('</g>');
  if(settings.grid){parts.push('<g id="grid" fill="none" stroke="#8e9198" stroke-width="1" shape-rendering="crispEdges">');for(let x=0;x<=pattern.width;x+=1){const px=margin+x*cell;parts.push(`<path d="M${px} ${margin}V${margin+pattern.height*cell}"/>`)}for(let y=0;y<=pattern.height;y+=1){const py=margin+y*cell;parts.push(`<path d="M${margin} ${py}H${margin+pattern.width*cell}"/>`)}parts.push('</g>')}
  if(settings.guides){parts.push('<g id="guides" fill="none" stroke="#c73539" stroke-width="2">');for(let x=10;x<pattern.width;x+=10){const px=margin+x*cell;parts.push(`<path d="M${px} ${margin}V${margin+pattern.height*cell}"/>`)}for(let y=10;y<pattern.height;y+=10){const py=margin+y*cell;parts.push(`<path d="M${margin} ${py}H${margin+pattern.width*cell}"/>`)}parts.push('</g>')}
  if(settings.numbers&&cell>=12){parts.push(`<g id="codes" font-family="Arial,sans-serif" font-size="${Math.max(6,Math.floor(cell*.3))}" font-weight="600" text-anchor="middle" dominant-baseline="central">`);for(let y=0;y<pattern.height;y+=1)for(let x=0;x<pattern.width;x+=1){const color=palette[pattern.indices[y*pattern.width+x]],l=color.rgb[0]*.299+color.rgb[1]*.587+color.rgb[2]*.114;parts.push(`<text x="${margin+(x+.5)*cell}" y="${margin+(y+.52)*cell}" fill="${l<135?'#fff':'#111'}">${escapeXml(color.code)}</text>`)}parts.push('</g>')}
  if(settings.coordinates){const step=pattern.width>120?10:5;parts.push(`<g id="coordinates" font-family="Arial,sans-serif" font-size="${Math.max(8,Math.floor(cell*.26))}" text-anchor="middle" dominant-baseline="central">`);for(let x=0;x<pattern.width;x+=step){const value=x+1,color=value%10===0?'#c73539':'#555',px=margin+(x+.5)*cell;parts.push(`<text x="${px}" y="${margin/2}" fill="${color}">${value}</text><text x="${px}" y="${height-margin/2}" fill="${color}">${value}</text>`)}for(let y=0;y<pattern.height;y+=step){const value=y+1,color=value%10===0?'#c73539':'#555',py=margin+(y+.5)*cell;parts.push(`<text x="${margin/2}" y="${py}" fill="${color}">${value}</text><text x="${width-margin/2}" y="${py}" fill="${color}">${value}</text>`)}parts.push('</g>')}
  parts.push('</svg>'); return parts.join('');
}

export function exportSvg(pattern,palette,settings){const svg=createPatternSvg(pattern,palette,settings);const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'});download(blob,`拼豆图纸-${pattern.width}x${pattern.height}.svg`);return blob;}
