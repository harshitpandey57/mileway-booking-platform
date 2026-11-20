// The API and documentation share the same origin so Swagger can use the session cookie.
type Schema = Record<string,unknown>;
const str=(description?:string):Schema=>({type:'string',...(description?{description}:{})});
const num:Schema={type:'number'};
const bool:Schema={type:'boolean'};
const obj=(properties:Record<string,Schema>,required=Object.keys(properties)):Schema=>({type:'object',properties,required});
const arr=(items:Schema):Schema=>({type:'array',items});
const id:Schema={type:'string',pattern:'^[a-fA-F0-9]{24}$'};
const choices=(...values:string[]):Schema=>({type:'string',enum:values});
const date:Schema={type:'string',format:'date'};
const timestamp:Schema={type:'string',format:'date-time'};
const routePair=obj({from:str(),to:str()});
const contact=obj({name:str(),age:num});
const bookingId=obj({bookingId:id});
const email:Schema={type:'string',format:'email'};
const password:Schema={type:'string',format:'password',minLength:10};
const paths:Record<string,Record<string,unknown>>={};
const errorSchema=obj({error:obj({message:str()})});
const json=(schema:Schema)=>({'application/json':{schema}});
type Operation={public?:boolean;body?:Schema;result?:Schema;params?:Record<string,Schema>;requiredParams?:string[];status?:number;detail?:string;pdf?:boolean;webhook?:boolean};
function endpoint(method:string,path:string,summary:string,options:Operation={}){
  const tag=path.split('/')[1];
  const parameters:Record<string,unknown>[]=Array.from(path.matchAll(/\{(\w+)\}/g),([,name])=>({name,in:'path',required:true,schema:name==='id'?id:str()}));
  for(const [name,schema] of Object.entries(options.params || {})) parameters.push({name,in:'query',required:options.requiredParams?.includes(name)||false,schema});
  if(options.webhook) parameters.push({name:'X-Razorpay-Signature',in:'header',required:true,schema:str()});
  const ok={description:options.pdf?'Downloadable ticket':'Successful response',content:options.pdf?{'application/pdf':{schema:{type:'string',format:'binary'}}}:json(obj({data:options.result || {}}))};
  (paths[path] ||= {})[method]={tags:[tag],summary,description:options.detail,parameters,security:options.public?[]:[{session:[]}],...(options.body?{requestBody:{required:true,content:json(options.body)}}:{}),
    responses:{[options.status||200]:ok,default:{description:'Validation, authentication, authorization, conflict or service error',content:json(errorSchema)}}};
}

const pub={public:true};
const page={page:num,limit:num};
endpoint('post','/auth/register','Register a customer and start a session',{...pub,status:201,body:obj({name:str(),email,password})});
endpoint('post','/auth/login','Start a seven-day cookie session',{...pub,body:obj({email,password:str()})});
endpoint('post','/auth/logout','Invalidate sessions for this account');
endpoint('get','/auth/me','Read the current profile');
endpoint('post','/auth/change-password','Change password and invalidate old sessions',{body:obj({currentPassword:str(),newPassword:password})});
endpoint('post','/auth/forgot-password','Request a time-limited password reset link',{...pub,body:obj({email}),result:obj({success:bool,delivery:choices('console','email')}),detail:'Delivery identifies the configured channel. The response is the same for registered and unknown addresses.'});
endpoint('post','/auth/reset-password','Consume a one-time password reset token',{...pub,body:obj({token:str(),password})});
endpoint('get','/users/me','Read profile, saved passengers, favorites and history');
endpoint('patch','/users/me','Update profile',{body:obj({name:str(),phone:str()})});
endpoint('post','/users/me/passengers','Save passenger details',{status:201,body:contact});
endpoint('delete','/users/me/passengers/{id}','Remove a saved passenger');
for(const method of ['post','delete'])endpoint(method,'/users/me/favorites',method==='post'?'Save a route':'Remove a favorite',{body:routePair});
endpoint('post','/users/me/history','Record a search',{body:obj({from:str(),to:str(),date})});
endpoint('get','/users/me/notifications','List notifications',{params:page});
endpoint('patch','/users/me/notifications/{id}','Mark notification as read');
endpoint('post','/support','Open a support ticket',{status:201,body:obj({subject:str(),message:str()})});
endpoint('get','/support','Read your support tickets and replies',{params:page});
endpoint('get','/cities','Find cities by name prefix',{...pub,params:{q:str(),...page}});
for(const resource of ['operators','routes','buses'])endpoint('get','/'+resource,'Browse '+resource,{...pub,params:page});
endpoint('get','/routes/popular','Popular city pairs with a current fare and distance',pub);
const period=choices('morning','afternoon','evening','night');
const filters={from:str(),to:str(),date,minPrice:num,maxPrice:num,ac:bool,kind:choices('seater','sleeper'),departure:period,arrival:period,operator:str(),amenities:str('Comma-separated amenity names'),minRating:num,sort:choices('price','duration','departure','rating'),...page};
for(const url of ['/search','/trips'])endpoint('get',url,'Search scheduled departures and live seat availability',{...pub,params:filters,requiredParams:['from','to','date'],detail:'Date and departure/arrival periods use Asia/Kolkata. Prices are in whole Indian rupees.'});
endpoint('get','/trips/{id}','Read departure details, stops and cancellation terms',pub);
endpoint('get','/trips/{id}/seats','Read deck layouts, individual prices and effective seat states',pub);
endpoint('get','/coupons','List active, unexpired offers',pub);
endpoint('get','/reviews','List visible reviews',{...pub,params:{operatorId:id,...page}});
endpoint('post','/reviews','Review one completed confirmed booking',{status:201,body:obj({bookingId:id,rating:num,comment:str()})});
endpoint('post','/seat-holds','Reserve one to six distinct seats for up to ten minutes',{status:201,body:obj({tripId:id,seats:arr(str())})});
endpoint('get','/seat-holds/{id}','Read your hold and expiry');
endpoint('delete','/seat-holds/{id}','Release your active hold');
endpoint('post','/bookings','Create a pending booking at the server-calculated fare',{status:201,body:obj({holdId:id,passengers:arr(obj({seat:str(),name:str(),age:num})),phone:str(),email,boardingPoint:str(),droppingPoint:str(),couponCode:str()},['holdId','passengers','phone','email','boardingPoint','droppingPoint'])});
endpoint('get','/bookings','List your bookings',{params:page});
endpoint('get','/bookings/{id}','Read your booking');
endpoint('post','/bookings/{id}/cancel','Cancel a booking under its stored cancellation policy');
endpoint('post','/payments/order','Create or reuse a test checkout order',{body:bookingId,detail:'The response amount is in paise. The booking price is in rupees.'});
endpoint('post','/payments/verify','Verify a signed checkout and check gateway capture',{body:obj({bookingId:id,razorpay_order_id:str(),razorpay_payment_id:str(),razorpay_signature:str()})});
endpoint('post','/payments/demo','Simulate an outcome on an authorized demo service',{body:obj({bookingId:id,outcome:choices('success','failure','cancel')})});
endpoint('post','/payments/failure','Record an unsuccessful checkout',{body:bookingId});
endpoint('post','/payments/webhook','Handle an authenticated Razorpay event',{...pub,webhook:true,body:obj({event:str(),payload:{type:'object'}}),detail:'Verify the HMAC-SHA256 of the raw JSON body using the webhook secret. Supported events: payment.captured and payment.failed.'});
endpoint('get','/tickets/{id}/pdf','Download your confirmed ticket as PDF',{pdf:true});
endpoint('get','/tickets/verify/{token}','Verify an opaque ticket token without passenger contact details',pub);

const fleetBody:Record<string,Schema>={
 buses:obj({operatorId:id,name:str(),busType:choices('AC Sleeper','AC Seater','Non-AC Sleeper','Non-AC Seater'),fare:num,seatCount:num,amenities:arr(str()),seats:arr(obj({number:str(),row:num,col:num,kind:str(),deck:str(),price:num}))},['name','busType','fare','seatCount','amenities']),
 routes:obj({operatorId:id,from:str(),to:str(),distanceKm:num,boardingPoints:arr(str()),droppingPoints:arr(str())},['from','to','distanceKm','boardingPoints','droppingPoints']),
 trips:obj({operatorId:id,busId:id,routeId:id,departureAt:timestamp,arrivalAt:timestamp,fare:num,cancellationHours:num,refundPercent:num},['busId','routeId','departureAt','arrivalAt','fare','cancellationHours','refundPercent']),
 coupons:obj({code:str(),percent:num,maxDiscount:num,minFare:num,expiresAt:timestamp,active:bool,description:str()}),
 operators:obj({name:str(),description:str(),email,password}),users:obj({name:str(),active:bool}),reviews:obj({visible:bool}),support:obj({status:choices('open','in_progress','resolved'),reply:str()})};
for(const role of ['admin','operator']){
 const prefix='/'+role;
 endpoint('get',prefix+'/overview','Dashboard totals, seven-day revenue, popular routes and recent bookings');
 endpoint('get',prefix+'/options','Look up values for the scheduling and fleet editors',{params:{kind:str(),term:str(),operatorId:id,page:num},requiredParams:['kind']});
 endpoint('get',prefix+'/trips/{id}/manifest','Read the passenger manifest for an authorized trip');
 if(role==='admin')endpoint('post',prefix+'/bookings/{id}/cancel','Cancel an authorized booking with a simulated refund');
 const resources=role==='admin'?['buses','routes','trips','bookings','users','operators','coupons','reviews','support','payments','refunds','audit']:['buses','routes','trips','bookings'];
 for(const resource of resources){
   const url=prefix+'/'+resource;
   endpoint('get',url,'Browse '+resource+' within your scope',{params:{page:num,pageSize:num}});
   if(['buses','routes','trips','operators','coupons'].includes(resource))endpoint('post',url,'Add a record',{status:201,body:fleetBody[resource]});
   if(fleetBody[resource])endpoint('put',url+'/{id}','Update an authorized record',{body:resource==='trips'?{oneOf:[fleetBody.trips,obj({status:choices('scheduled','delayed','cancelled','completed')})]}:fleetBody[resource]});
   if(['buses','routes','coupons'].includes(resource))endpoint('delete',url+'/{id}','Remove an eligible record');
 }
}
export const openapi={openapi:'3.0.3',info:{title:'Mileway booking API',version:'1.0.0',description:'Fictional Indian intercity bus inventory. All payment and ticket flows are for testing. Browser write requests use JSON and same-origin sessions.'},servers:[{url:'/api/v1'}],components:{securitySchemes:{session:{type:'apiKey',in:'cookie',name:'mileway_session'}}},paths};
