// A single-page PDF with an embedded JPEG; no remote service or font dependency.
export function diagramPdf(jpeg,width,height){
 const landscape=width>=height,pageW=landscape?842:595,pageH=landscape?595:842,scale=Math.min((pageW-40)/width,(pageH-40)/height),w=width*scale,h=height*scale,x=(pageW-w)/2,y=(pageH-h)/2,encoder=new TextEncoder(),chunks=[],offsets=[0];let length=0;
 const add=value=>{const bytes=typeof value==='string'?encoder.encode(value):value;chunks.push(bytes);length+=bytes.length;};
 const object=(id,body)=>{offsets[id]=length;add(`${id} 0 obj\n${body}\nendobj\n`);};
 add('%PDF-1.4\n');object(1,'<< /Type /Catalog /Pages 2 0 R >>');object(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');object(3,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Diagram 4 0 R >> >> /Contents 5 0 R >>`);
 offsets[4]=length;add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);add(jpeg);add('\nendstream\nendobj\n');
 const content=`q\n${w.toFixed(5)} 0 0 ${h.toFixed(5)} ${x.toFixed(5)} ${y.toFixed(5)} cm\n/Diagram Do\nQ\n`;object(5,`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`);
 const start=length;add('xref\n0 6\n0000000000 65535 f \n');for(let i=1;i<=5;i++)add(String(offsets[i]).padStart(10,'0')+' 00000 n \n');add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
 const bytes=new Uint8Array(length);let cursor=0;for(const chunk of chunks){bytes.set(chunk,cursor);cursor+=chunk.length;}return bytes;
}
