export function createStatisticsCsv(statistics) {
  const rows = [['编号','名称','HEX','数量','占比'], ...statistics.map((item) => [item.code,item.name,item.hex,item.count,`${item.percentage.toFixed(2)}%`])];
  return rows.map((row)=>row.map((cell)=>`"${String(cell).replaceAll('"','""')}"`).join(',')).join('\r\n');
}
export function exportCsv(statistics, size) { const blob=new Blob(['\ufeff',createStatisticsCsv(statistics)],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`拼豆颜色统计-${size.width}x${size.height}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return blob; }
