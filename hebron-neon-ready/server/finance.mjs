export function toPaise(v){
  if(typeof v==='number')v=v.toString();v=String(v??'').replace(/,/g,'').trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(v))throw Error('Enter a valid rupee amount, up to two decimals');
  const [a,b='']=v.split('.');const n=BigInt(a)*100n+BigInt((b+'00').slice(0,2));
  if(n<=0n||n>999999999999n)throw Error('Amount must be greater than zero and within the allowed range');
  return Number(n);
}
export function rupees(paise){return '₹'+(Number(paise||0)/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});}
export function balance({charges=[],discounts=[],payments=[]}){
  const due=charges.reduce((a,x)=>a+Number(x.amount_paise),0)-discounts.reduce((a,x)=>a+Number(x.amount_paise),0);
  const paid=payments.filter(x=>x.status==='posted').reduce((a,x)=>a+Number(x.amount_paise),0);
  return {due_paise:due,paid_paise:paid,balance_paise:due-paid};
}
