export function confirmedGroupRemoval(key,error){
 return /^group:\d+$/.test(String(key)) && /\u4f60\u5df2\u88ab\u79fb\u51fa\u8be5\u7fa4|\u4f60\u5df2\u7ecf\u88ab\u79fb\u51fa\u8be5\u7fa4|\u673a\u5668\u4eba\u5df2\u88ab\u79fb\u51fa\u8be5\u7fa4/.test(String(error?.message??error??''));
}
export function isSelfGroupDeparture(event){
 return event?.post_type==='notice' && event?.notice_type==='group_decrease' &&
 /^\d+$/.test(String(event?.self_id??'')) && Number(event.self_id)>0 && String(event.user_id)===String(event.self_id);
}
