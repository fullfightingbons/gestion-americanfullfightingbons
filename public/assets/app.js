// ═══════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════
const CLOUDFLARE_API_BASE = '/api';
const FORCED_LOGO_URL = '/assets/Logo_1_nnoir_copie-removebg-preview.png';
const DIPLOME_BUCKET = 'storage';
const DIPLOME_PDF_BUCKET = 'fullfighting-pdf';
const DIPLOME_PDF_PREFIX = 'adherents/diplomes'; // perm_adherents (cf. hasStoragePermission côté Worker)
const DIPLOME_IMAGE_RE = /\.(png|jpe?g|webp)$/i;
const DIPLOME_LAYOUTS_KEY = 'diplome_layouts';
const DIPLOME_SIGNATURE_KEY = 'diplome_signature_url';
const DIPLOME_PAGE = {pdfWidthPt:842,pdfHeightPt:595,canvasWidth:1684,canvasHeight:1190};
const DIPLOME_FIELD_META = [
  {key:'nomComplet',label:'Nom complet',type:'text'},
{key:'prenom',label:'Prénom',type:'text'},
{key:'nom',label:'Nom',type:'text'},
{key:'licence',label:'N° licence',type:'text'},
{key:'date',label:'Date',type:'text'},
{key:'logo',label:'Logo du club',type:'image'},
{key:'signature',label:'Signature',type:'image'},
];
const DIPLOME_FONT_OPTIONS = [
  {value:"'Petit Formal Script','Segoe Script','Lucida Handwriting','Brush Script MT',cursive",label:'Petit Formal Script'},
{value:"'Great Vibes','Petit Formal Script','Segoe Script',cursive",label:'Great Vibes'},
{value:"'Playfair Display','Times New Roman',serif",label:'Playfair Display'},
{value:"'Cormorant Garamond','Times New Roman',serif",label:'Cormorant Garamond'},
{value:"'Montserrat','Avenir Next','Segoe UI',sans-serif",label:'Montserrat'},
{value:"'Oswald','Arial Narrow',sans-serif",label:'Oswald'},
{value:"'Times New Roman',serif",label:'Times New Roman'},
{value:"Georgia,serif",label:'Georgia'},
{value:"Arial,sans-serif",label:'Arial'},
];
const DEFAULT_DIPLOME_FIELDS = {
  nomComplet:{enabled:true,left:50,top:53.1,width:44,fontSize:30,fontFamily:"'Petit Formal Script','Segoe Script','Lucida Handwriting','Brush Script MT',cursive",fontWeight:'600',fontStyle:'normal',align:'center',color:'#16110d',letterSpacing:0},
  prenom:{enabled:false,left:50,top:49,width:22,fontSize:22,fontFamily:"'Petit Formal Script','Segoe Script','Lucida Handwriting','Brush Script MT',cursive",fontWeight:'500',fontStyle:'normal',align:'center',color:'#16110d',letterSpacing:0},
  nom:{enabled:false,left:50,top:57,width:26,fontSize:24,fontFamily:"'Petit Formal Script','Segoe Script','Lucida Handwriting','Brush Script MT',cursive",fontWeight:'600',fontStyle:'normal',align:'center',color:'#16110d',letterSpacing:0},
  date:{enabled:true,left:27.2,top:75.7,width:14.2,fontSize:16,fontFamily:"'Playfair Display','Times New Roman',serif",fontWeight:'600',fontStyle:'normal',align:'left',color:'#16110d',letterSpacing:0},
  licence:{enabled:true,left:82.2,top:77.2,width:12,fontSize:15,fontFamily:"'Playfair Display','Times New Roman',serif",fontWeight:'600',fontStyle:'normal',align:'left',color:'#16110d',letterSpacing:0},
  logo:{enabled:false,left:50,top:18,width:16,height:18,align:'center',objectFit:'contain'},
  signature:{enabled:false,left:82,top:86,width:18,height:10,align:'center',objectFit:'contain'},
};
const DEFAULT_CLUB_NAME = 'AMERICAN FULL FIGHTING BONS EN CHABLAIS';
const DEFAULT_SIRET = '92470461200010';
const DANGEROUS_RESTORE_PHRASE = 'RESTAURER';
const NOTICE_LIFETIME = 5200;
const INSCRIPTION_BOUTIQUE_PRODUCTS_URL = 'https://boutique.americanfullfightingbons.fr/api/products';

const ROLES = {admin:'Administrateur',tresorier:'Trésorier',secretaire:'Secrétaire',entraineur:'Entraîneur',membre:'Membre'};
const AVC   = ['#C0392B','#D4AC0D','#1D9E75','#378ADD','#8e44ad','#e67e22'];
const MODES_PAIE = ['Virement','Chèque','Espèces','CB','Prélèvement','HelloAsso','Gratuit'];
const ADH_TYPES = ['Club','CSE Thalès','Membre du Bureau'];
const ADH_STATUTS = ['Actif','Renouvellement','Inactif','Adhésion annulée'];
const CEINTURE_COLORS = ['Blanche','Jaune','Orange','Verte','Bleue','Marron','Noire'];

const ALL_TABS = [
  {id:'dashboard',    icon:'🏁',label:'Pilotage'},
{id:'services',     icon:'🟢',label:'Services',     perm:'perm_administration'},
{id:'adherents',    icon:'👥',label:'Adhérents',    perm:'perm_adherents'},
{id:'diplomes',     icon:'🎓',label:'Diplômes',     perm:'perm_adherents'},
{id:'banque',       icon:'🏦',label:'Banque',        perm:'perm_banque'},
{id:'comptabilite', icon:'📊',label:'Comptabilité',  perm:'perm_comptabilite'},
{id:'achat',        icon:'🛒',label:'Achats',         perm:'perm_achats'},
{id:'facture',      icon:'💸',label:'Ventes',        perm:'perm_facturation'},
{id:'feedback',     icon:'💬',label:'Feedback',      perm:'perm_administration'},
{id:'administration',icon:'⚙️',label:'Administration',perm:'perm_administration'},
];
const PERM_META = [
  ['perm_adherents','👥 Adhérents'],
['perm_banque','🏦 Banque'],
['perm_comptabilite','📊 Comptabilité'],
['perm_achats','🛒 Achats'],
['perm_facturation','💸 Ventes'],
['perm_administration','⚙️ Administration'],
];
const PERM_LEVELS = {
  none:{label:'Aucun accès',rank:0},
  read:{label:'Lecture',rank:1},
  write:{label:'Lecture / écriture',rank:2},
};
const DEFAULT_ROLE_PERMS = {
  admin:{perm_adherents:'write',perm_banque:'write',perm_comptabilite:'write',perm_achats:'write',perm_facturation:'write',perm_administration:'write'},
  tresorier:{perm_adherents:'write',perm_banque:'write',perm_comptabilite:'write',perm_achats:'write',perm_facturation:'write',perm_administration:'none'},
  secretaire:{perm_adherents:'write',perm_banque:'none',perm_comptabilite:'none',perm_achats:'none',perm_facturation:'none',perm_administration:'none'},
  entraineur:{perm_adherents:'read',perm_banque:'none',perm_comptabilite:'none',perm_achats:'none',perm_facturation:'none',perm_administration:'none'},
  membre:{perm_adherents:'none',perm_banque:'none',perm_comptabilite:'none',perm_achats:'none',perm_facturation:'none',perm_administration:'none'},
};

const PLAN = [
  '1010 - Fonds associatif sans droit de reprise',
'1060 - Réserves',
'1200 - Résultat de l exercice excédent',
'1290 - Résultat de l exercice déficit',
'1640 - Emprunts auprès des établissements de crédit',
'401 - Fournisseurs',
'411 - Adhérents et clients',
'471 - Comptes d attente',
'4870 - Produits constatés d avance',
'512 - Banque',
'518 - Intérêts courus à payer et à recevoir',
'5300 - Caisse',
'6051 - Achats de matériels et équipements sportifs',
'6052 - Achats de textile et tenues',
'606 - Achats non stockés fournitures',
'6061 - Fournitures non stockées',
'6063 - Petit équipement',
'6132 - Locations immobilières',
'616 - Primes assurances',
'6226 - Honoraires',
'623 - Publicité publications',
'6230 - Achats de produits publicitaires',
'6241 - Transports sur achats',
'625 - Déplacements missions réceptions',
'6251 - Voyages et déplacements',
'6257 - Réceptions repas',
'626 - Frais postaux télécoms',
'6260 - Téléphone et communications',
'627 - Services bancaires',
'6270 - Frais bancaires',
'628 - Cotisations fédérales licences',
'6281 - Cotisations fédérales et licences',
'6580 - Charges diverses de gestion courante',
'651 - Redevances droits d auteur SACEM',
'706 - Prestations de services',
'7060 - Prestations de services',
'7061 - Cours et stages',
'707 - Ventes vêtements et équipements',
'7080 - Produits des activités annexes',
'7088 - Participations et produits accessoires Pass Région',
'741 - Subventions',
'7410 - Remboursements Pass Région',
'754 - Dons manuels',
'753 - Cotisations',
'7561 - Cotisations membres actifs',
'7562 - Cotisations licences et adhésions annexes',
'7580 - Autres produits de gestion courante',
];
const PLAN_OPT = PLAN.map(p=>`<option value="${p}">${p}</option>`).join('');

// Champs mapping import
const ADH_FIELDS = [
  {key:'nom',              label:'Nom',               aliases:['nom','lastname','name','nom de famille']},
{key:'prenom',           label:'Prénom',            aliases:['prenom','prénom','firstname','first name']},
{key:'naissance',        label:'Date naissance',    aliases:['naissance','date naissance','dob','birthdate']},
{key:'couleur_ceinture', label:'Couleur ceinture',  aliases:['couleur ceinture','ceinture','grade','belt','belt color']},
{key:'numero_licence',   label:'N° licence',        aliases:['numero licence','numéro licence','n° licence','licence','license','license number']},
{key:'email',            label:'Email',             aliases:['email','mail','courriel']},
{key:'telephone',        label:'Téléphone',         aliases:['telephone','téléphone','tel','phone','mobile','portable']},
{key:'adresse',          label:'Adresse',           aliases:['adresse','address','rue','street']},
{key:'code_postal',      label:'Code postal',       aliases:['code postal','cp','zip','postal','code_postal']},
{key:'ville',            label:'Ville',             aliases:['ville','city','commune']},
{key:'discipline',       label:'Type adhésion',     aliases:['discipline','sport','section','activite','activité','type adhésion','type adhesion','club','cse','thalès','thales']},
{key:'cotisation',       label:'Cotisation (€)',     aliases:['cotisation','montant','tarif','fee','amount']},
{key:'paiement',         label:'Mode paiement',     aliases:['paiement','mode paiement','payment','mode de paiement']},
{key:'date_inscription', label:'Date inscription',  aliases:['inscription','date inscription','adhesion','adhésion']},
{key:'date_fin_adhesion',label:'Fin adhésion',      aliases:['fin adhesion','fin adhésion','expiration','date fin','validite']},
{key:'statut',           label:'Statut',            aliases:['statut','status','etat','état']},
{key:'certificat',       label:'Certificat médical',aliases:['certificat','certif','medical']},
{key:'droit_image',      label:'Droit à l\'image',  aliases:['droit image','image']},
{key:'reglement',        label:'Règlement intérieur',aliases:['reglement','règlement']},
{key:'pass_region',      label:'Pass Région',        aliases:['pass region','pass_région','pass région','pass']},
{key:'montant_pass_region',label:'Montant Pass Région',aliases:['montant pass region','montant pass région','aide région','montant aide région']},
{key:'urgence_nom',      label:'Urgence — Nom',     aliases:['urgence nom','contact urgence','emergency']},
{key:'urgence_telephone',label:'Urgence — Tél',     aliases:['urgence tel','urgence telephone','emergency phone']},
{key:'notes',            label:'Notes',             aliases:['notes','remarque','commentaire','observation']},
];
const ECR_FIELDS = [
  {key:'date_op', label:'Date',           aliases:['date','date op','date_op','date opération','date ecriture','date comptable']},
{key:'piece',   label:'N° pièce',      aliases:['piece','pièce','numero','ref','facture','n°','num piece','numéro pièce']},
{key:'compte',  label:'Compte',        aliases:['compte','account','code compte','numéro compte','compte général']},
{key:'libelle', label:'Libellé',       aliases:['libelle','libellé','description','label','intitule','designation','libellé écriture']},
{key:'debit',   label:'Débit (€)',     aliases:['debit','débit','montant debit','charge','sortie','débit eur']},
{key:'credit',  label:'Crédit (€)',    aliases:['credit','crédit','montant credit','produit','entree','entrée','crédit eur']},
];

// ═══════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════
let SB = null;
let AUTH_TOKEN = null; // token JWT Bearer pour les appels API
const D = {
  adherents:[], comptes:[], journal:[], achats:[], factures:[],
  publicRegistrations:[],
    users:[], auditLogs:[], clubInfo:{}, exercices:[], currentExo:null,
    logoUrl: FORCED_LOGO_URL,
    diplomeTemplates:[],
    diplomeTemplatesError:'',
    diplomeLayouts:{},
    diplomes:[],
    feedbackCampaigns:[], feedbackRecipients:[], feedbackResponses:[],
    rolePerms: JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMS)),
    loaded:{core:false,dashboard:false,adherents:false,banque:false,comptabilite:false,achat:false,facture:false,administration:false,diplomesArchive:false,feedback:false},
    loading:{},
};
const UI = {
  tab:'dashboard',
  subTab:{banque:'comptes',compta:'journal',facture:'liste',achat:'liste',admin:'users',feedback:'liste'},
  modal:null, editObj:null, currentUser:null,
  notices:[],
  search:{adherents:'',achats:'',factures:'',feedback:''},
  adhFilters:{statut:'',type:'',season:'current',special:''},
  adhSelected:{},
  adhSort:{key:'nom',dir:'asc'},
  adhDetailId:null,
  achatFilterStatus:'',
  achatFilterCat:'',
  achatFilterDateFrom:'',
  achatFilterDateTo:'',
  dashPeriod:'6m',
  factureFilterStatus:'',
  budgetCats:{},
  paging:{adherents:1,achats:1,factures:1,dons:1,feedback:1},
  bankAccountId:null,
  bankPreview:null,
  bankTxSearch:'',
  bankTxRapprFilter:'',
  bankTxDateFrom:'',
  bankTxDateTo:'',
  pdfTarget:null,
  diplome:{adherentId:'',date:td(),templatePath:'',titre:'Diplôme de ceinture',selectedField:'nomComplet',delivrePar:'',commentaire:''},
  diplomeArchive:{saison:'current',search:''},
  invState:{numero:'FAC-001',date:td(),destinataire:'',adresse:'',objet:'',lignes:[{desc:'',qte:1,pu:0}],notes:''},
  invKind:'facture',
  glFilter:'',
  glClassFilter:'',
  rapprMultiSel:{},
  feedbackCampaignId:null,
};
let IMP = {
  adh:{raw:'',headers:[],rows:[],mapping:{},sep:';',importing:false},
  ecr:{raw:'',headers:[],rows:[],mapping:{},sep:';',importing:false},
  backup:{restoring:false,lastMessage:''},
};

function compareAlpha(a,b){
  return (a||'').localeCompare((b||''),'fr',{sensitivity:'base'});
}

function deepClone(v){
  return JSON.parse(JSON.stringify(v));
}

function plainText(v){
  return String(v??'')
  .replace(/<br\s*\/?>/gi,'\n')
  .replace(/<\/(div|p|li|h\d)>/gi,'\n')
  .replace(/<[^>]+>/g,' ')
  .replace(/[ \t]+\n/g,'\n')
  .replace(/\n{3,}/g,'\n\n')
  .replace(/\s{2,}/g,' ')
  .trim();
}

function notify(type,message,title){
  const text=plainText(message);
  if(!text) return;
  const notice={
    id:crypto.randomUUID(),
    type:type||'info',
    title:title||(
      type==='error'?'Erreur':
      type==='success'?'Succès':
      type==='warn'?'Attention':
      'Information'
    ),
    message:text
  };
  UI.notices=[...UI.notices.filter(n=>n.message!==notice.message).slice(-3),notice];
  renderNotices();
  setTimeout(()=>dismissNotice(notice.id),NOTICE_LIFETIME);
}

function dismissNotice(id){
  const before=UI.notices.length;
  UI.notices=UI.notices.filter(n=>n.id!==id);
  if(UI.notices.length!==before) renderNotices();
}

function renderNotices(){
  const host=document.getElementById('app-notices');
  if(!host) return;
  host.innerHTML=UI.notices.map(n=>`<div class="notice ${n.type==='error'?'error':n.type==='success'?'success':n.type==='warn'?'warn':''}" role="${n.type==='error'?'alert':'status'}">
  <div class="notice-head">
  <div class="notice-title">${esc(n.title)}</div>
  <button class="notice-close" type="button" aria-label="Fermer" onclick="dismissNotice('${n.id}')">×</button>
  </div>
  <div class="notice-body">${esc(n.message).replace(/\n/g,'<br>')}</div>
  </div>`).join('');
}

window.dismissNotice=dismissNotice;
window.alert=function(message){ notify('info',message); };
window._onSessionExpired=function(){
  if(UI.currentUser){
    UI.currentUser=null;
    const appEl=document.getElementById('app');
    if(appEl) appEl.style.display='none';
    showLoginScreen();
    notify('warn','Votre session a expiré. Reconnectez-vous pour continuer.','Session expirée');
  }
};
window.addEventListener('error',function(event){
  const msg=event?.error?.message || event?.message;
  if(msg) notify('error',msg,'Erreur JavaScript');
});
window.addEventListener('unhandledrejection',function(event){
  const reason=event?.reason?.message || event?.reason;
  if(reason) notify('error',String(reason),'Erreur non gérée');
});

function esc(v){
  return (v??'').toString()
  .replace(/&/g,'&amp;')
  .replace(/</g,'&lt;')
  .replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;')
  .replace(/'/g,'&#39;');
}

function sortAdherentsList(list){
  const {key='nom',dir='asc'}=UI?.adhSort||{};
  return (list||[]).sort((a,b)=>{
    let va,vb;
    if(key==='cotisation'||key==='montant_pass_region'){
      va=+(a[key]||0); vb=+(b[key]||0);
      return dir==='asc'?va-vb:vb-va;
    }
    if(key==='date_fin_adhesion'||key==='date_inscription'){
      va=a[key]||''; vb=b[key]||'';
      return dir==='asc'?va.localeCompare(vb):vb.localeCompare(va);
    }
    va=String(a[key]??''); vb=String(b[key]??'');
    const c=va.localeCompare(vb,'fr',{sensitivity:'base'});
    return dir==='asc'?c:-c;
  });
}

function thSort(label,key){
  const active=UI.adhSort?.key===key;
  const dir=active?(UI.adhSort?.dir||'asc'):'asc';
  const arrow=active?(dir==='asc'?'▲':'▼'):'⇅';
  return `<th style="cursor:pointer;user-select:none" onclick="UI.adhSort={key:'${key}',dir:'${active&&dir==='asc'?'desc':'asc'}'};render()" title="Trier par ${label}">${label} <span style="font-size:10px;opacity:${active?1:0.4}">${arrow}</span></th>`;
}

function sortExercicesList(list){
  return (list||[]).sort((a,b)=>(b?.date_debut||'').localeCompare(a?.date_debut||''));
}

function refreshCurrentExo(){
  D.exercices=sortExercicesList(D.exercices);
  D.currentExo=D.exercices.find(e=>e.statut==='actif')||D.exercices[0]||null;
  const badge=document.getElementById('exo-badge');
  if(badge) badge.textContent=D.currentExo?.libelle||'Aucun exercice actif';
}

function requireExerciceActif(){
  if(D.currentExo?.statut==='actif') return true;
  alert('Aucun exercice comptable actif. Créez ou sélectionnez un exercice actif avant de poursuivre.');
  UI.tab='comptabilite';
  UI.subTab.compta='exo';
  render();
  return false;
}

function normalizeAdherentFinance(row){
  const next={...(row||{})};
  if(next.discipline==='Membre du Bureau'){
    next.paiement='Gratuit';
    next.cotisation=0;
  }
  return next;
}

function normalizeUserRow(row){
  const next={...(row||{})};
  // Booléens stricts uniquement
  ['actif','must_change_password'].forEach(key=>{
    next[key]=next[key]===true || next[key]===1 || next[key]==='1';
  });
  // Permissions : conserver la valeur string "read"/"write"/"none" si présente
  // Ne normaliser en booléen que si la valeur est 0/1/true/false
  ['perm_adherents','perm_banque','perm_comptabilite','perm_achats','perm_facturation','perm_administration'].forEach(key=>{
    const v=next[key];
    if(typeof v==='string' && (v==='read'||v==='write'||v==='none')) return; // OK, laisser tel quel
    if(v===true || v===1 || v==='1') next[key]='write';
    else if(v===false || v===0 || v==='0') next[key]='none';
    else next[key]=null; // null = pas de surcharge explicite, on utilisera le rôle
  });
    return next;
}

function normalizeFactureRow(row){
  const next={...(row||{})};
  if(typeof next.lignes==='string'){
    try{
      const parsed=JSON.parse(next.lignes);
      next.lignes=Array.isArray(parsed)?parsed:[];
    }catch(e){
      next.lignes=[];
    }
  }else if(!Array.isArray(next.lignes)){
    next.lignes=[];
  }
  return next;
}

function markLoaded(key,value=true){
  D.loaded[key]=value;
}

function resetLoadedData(){
  D.loaded={core:false,dashboard:false,adherents:false,banque:false,comptabilite:false,achat:false,facture:false,administration:false};
  D.loading={};
}

function applyCoreData(payload={}){
  D.clubInfo=payload.clubInfo||D.clubInfo||{};
  D.exercices=sortExercicesList(payload.exercices||D.exercices||[]);
  D.currentExo=D.exercices.find(e=>e.statut==='actif')||D.exercices[0]||null;
  D.logoUrl=clubLogoUrl();
  loadDiplomeLayoutsFromClubInfo();
  let rolePermsRaw=null;
  try{rolePermsRaw=D.clubInfo.role_permissions?JSON.parse(D.clubInfo.role_permissions):null;}catch(e){rolePermsRaw=null;}
  D.rolePerms=rolePermsRaw?normalizeRolePerms(rolePermsRaw):deriveRolePermsFromUsers(D.users);
  if(D.currentExo) document.getElementById('exo-badge').textContent=D.currentExo.libelle;
  if(D.clubInfo?.nom){
    document.getElementById('hdr-nom').textContent=D.clubInfo.nom;
    document.getElementById('login-club-nom').textContent=D.clubInfo.nom;
  }
  markLoaded('core');
}

async function loadBootstrap(){
  const {data,error}=await apiRequest('/bootstrap');
  if(error) throw new Error(error.message||'Bootstrap indisponible');
  applyCoreData(data||{});
  if(data?.currentUser) UI.currentUser=normalizeUserRow(data.currentUser);
  return data;
}

async function loadCoreData(force=false){
  if(D.loaded.core && !force) return;
  await loadBootstrap();
}

async function loadTabData(tab, force=false){
  if(!force && D.loaded[tab]) return;
  if(D.loading[tab]) return D.loading[tab];
  D.loading[tab]=(async ()=>{
    await loadCoreData(force);
    if(tab==='dashboard'){
      const jobs=[];
      if(hasPerm('perm_adherents')) jobs.push(loadTabData('adherents',force));
      if(hasPerm('perm_banque')) jobs.push(loadTabData('banque',force));
      if(hasPerm('perm_comptabilite')) jobs.push(loadTabData('comptabilite',force));
      if(hasPerm('perm_achats')) jobs.push(loadTabData('achat',force));
      if(hasPerm('perm_facturation')) jobs.push(loadTabData('facture',force));
      await Promise.all(jobs);
      markLoaded('dashboard');
      return;
    }
    if(tab==='adherents' || tab==='diplomes'){
      const [adherentsRes, registrationsRes]=await Promise.all([
        SB.from('adherents').select('*').order('nom'),
                                                               SB.from('inscriptions_publiques').select('*').order('created_at',{ascending:false}).limit(500),
      ]);
      D.adherents=sortAdherentsList(adherentsRes.data||[]);
      D.publicRegistrations=registrationsRes.data||[];
      if(tab==='diplomes') await loadDiplomeArchive(force);
      markLoaded('adherents');
      return;
    }
    if(tab==='banque'){
      const [cpt,tr]=await Promise.all([
        SB.from('comptes_bancaires').select('*').order('created_at'),
                                       SB.from('transactions').select('*').order('date_op',{ascending:false}),
      ]);
      D.comptes=(cpt.data||[]).map(c=>({...c,transactions:(tr.data||[]).filter(t=>t.compte_id===c.id)}));
      markLoaded('banque');
      return;
    }
    if(tab==='comptabilite'){
      const {data}=await SB.from('journal_comptable').select('*').order('date_op',{ascending:false});
      D.journal=data||[];
      markLoaded('comptabilite');
      return;
    }
    if(tab==='achat'){
      const {data}=await SB.from('achats').select('*').order('date_op',{ascending:false});
      D.achats=data||[];
      markLoaded('achat');
      return;
    }
    if(tab==='facture'){
      const {data}=await SB.from('factures').select('*').order('created_at',{ascending:false});
      D.factures=(data||[]).map(normalizeFactureRow);
      markLoaded('facture');
      return;
    }
    if(tab==='administration'){
      const [usersRes,auditRes]=await Promise.all([
        SB.from('utilisateurs').select('*').order('created_at'),
                                                  SB.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(100),
      ]);
      D.users=(usersRes.data||[]).map(normalizeUserRow);
      D.auditLogs=auditRes.data||[];
      let rolePermsRaw=null;
      try{rolePermsRaw=D.clubInfo.role_permissions?JSON.parse(D.clubInfo.role_permissions):null;}catch(e){rolePermsRaw=null;}
      D.rolePerms=rolePermsRaw?normalizeRolePerms(rolePermsRaw):deriveRolePermsFromUsers(D.users);
      if(UI.currentUser?.id){
        const freshUser=D.users.find(u=>u.id===UI.currentUser.id);
        if(freshUser) UI.currentUser=normalizeUserRow(freshUser);
      }
      markLoaded('administration');
      return;
    }
    if(tab==='feedback'){
      const [campRes,recRes,repRes]=await Promise.all([
        SB.from('feedback_campaigns').select('*').order('created_at',{ascending:false}),
        SB.from('feedback_recipients').select('*').order('created_at',{ascending:false}),
        SB.from('feedback_responses').select('*').order('submitted_at',{ascending:false}),
      ]);
      D.feedbackCampaigns=campRes.data||[];
      D.feedbackRecipients=recRes.data||[];
      D.feedbackResponses=repRes.data||[];
      markLoaded('feedback');
      return;
    }
  })().finally(()=>{
    delete D.loading[tab];
  });
  return D.loading[tab];
}

async function loadDiplomeArchive(force){
  if(D.loaded.diplomesArchive && !force) return;
  try{
    const {data,error}=await SB.from('diplomes').select('*').order('date_emission',{ascending:false});
    if(error) throw error;
    D.diplomes=data||[];
    D.loaded.diplomesArchive=true;
  }catch(e){
    notify('error','Impossible de charger l’historique des diplômes : '+(e?.message||e),'Diplômes');
  }
}

// Liste des saisons distinctes présentes dans l'archive, triées de la plus récente à la plus ancienne.
function diplomeArchiveSeasons(){
  const set=new Set(D.diplomes.map(d=>d.saison).filter(Boolean));
  return Array.from(set).sort().reverse();
}

function diplomeArchiveFiltered(){
  const filterSeason=UI.diplomeArchive.saison;
  const q=(UI.diplomeArchive.search||'').toLowerCase().trim();
  let rows=D.diplomes;
  if(filterSeason!=='all'){
    const target=filterSeason==='current'?currentSeasonLabel():filterSeason;
    rows=rows.filter(d=>d.saison===target);
  }
  if(q) rows=rows.filter(d=>`${d.nom||''} ${d.prenom||''}`.toLowerCase().includes(q));
  return rows;
}

async function loadDiplomeTemplates(){
  if(!SB?.storage) return;
  try{
    const files=await listDiplomeTemplateFiles('diplome');
    D.diplomeTemplates=files.sort((a,b)=>compareAlpha(a.label,b.label));
    D.diplomeTemplatesError='';
    if(!UI.diplome.templatePath && D.diplomeTemplates.length){
      UI.diplome.templatePath=D.diplomeTemplates[0].path;
    }
  }catch(e){
    D.diplomeTemplates=[];
    D.diplomeTemplatesError=e?.message||'Impossible de lister les modèles.';
  }
}

function diplomeTemplateLabel(path){
  return (path||'').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ');
}

function isDiplomeTemplateFile(path){
  const name=(path||'').toLowerCase();
  return DIPLOME_IMAGE_RE.test(name) && !/logo|signature[-_ ]?serge|signautre[-_ ]?serge/i.test(name);
}

async function listDiplomeTemplateFiles(prefix='',depth=0){
  if(depth>5) return [];
  const {data,error}=await SB.storage.from(DIPLOME_BUCKET).list(prefix,{limit:100,sortBy:{column:'name',order:'asc'}});
  if(error) throw error;
  const out=[];
  for(const entry of (data||[])){
    if(!entry?.name) continue;
    const path=prefix?`${prefix}/${entry.name}`:entry.name;
    const isFolder=entry.id==null || entry.metadata==null;
    if(isFolder){
      out.push(...await listDiplomeTemplateFiles(path,depth+1));
      continue;
    }
    if(!isDiplomeTemplateFile(path)) continue;
    const {data:pub}=SB.storage.from(DIPLOME_BUCKET).getPublicUrl(path);
    out.push({
      name:entry.name,
      label:diplomeTemplateLabel(entry.name),
             url:pub?.publicUrl||'',
             path
    });
  }
  return out;
}

function guessDiplomeTemplateForAdherent(a){
  const belt=(a?.couleur_ceinture||'').toLowerCase();
  if(!belt||!D.diplomeTemplates.length) return D.diplomeTemplates[0]?.path||'';
  const match=D.diplomeTemplates.find(t=>t.name.toLowerCase().includes(belt));
  return match?.path||D.diplomeTemplates[0]?.path||'';
}

function selectedDiplomeTemplate(){
  return D.diplomeTemplates.find(t=>t.path===UI.diplome.templatePath) || D.diplomeTemplates[0] || null;
}

function clamp(n,min,max){
  return Math.max(min,Math.min(max,n));
}

function safeParseJSON(raw,fallback){
  if(!raw) return fallback;
  try{return JSON.parse(raw);}catch(e){return fallback;}
}

function normalizeInscriptionOrderProduct(raw={}){
  return {
    id:(raw.id||crypto.randomUUID()).toString(),
    source:raw.source==='boutique'?'boutique':'gestion',
    active:raw.active!==false,
    name:(raw.name||'').toString(),
    description:(raw.description||'').toString(),
    price:Number.isFinite(Number(raw.price))?Number(raw.price):0,
    defaultQtyNew:Math.max(0,parseInt(raw.defaultQtyNew||0,10)||0),
      requiresSize:Boolean(raw.requiresSize),
      boutiqueProductId:raw.boutiqueProductId?String(raw.boutiqueProductId):'',
  };
}

function getInscriptionOrderProducts(){
  const items=safeParseJSON(D.clubInfo?.inscription_order_products,[]);
  return Array.isArray(items)?items.map(normalizeInscriptionOrderProduct):[];
}

async function loadInscriptionBoutiqueProducts(force=false){
  if(!force && Array.isArray(D.inscriptionBoutiqueProducts)) return D.inscriptionBoutiqueProducts;
  try{
    const res=await fetch(INSCRIPTION_BOUTIQUE_PRODUCTS_URL,{cache:'no-store'});
    const data=await res.json().catch(()=>null);
    if(!res.ok || !Array.isArray(data)) throw new Error(`HTTP ${res.status}`);
    D.inscriptionBoutiqueProducts=data.map(p=>({
      id:String(p.id||''),
                                               name:(p.name||'').toString(),
                                               description:(p.description||'').toString(),
                                               price:Number(p.price||0),
                                               sizes:Array.isArray(p.sizes)?p.sizes:[],
                                               stock:Number(p.stock||0),
    })).filter(p=>p.id);
  }catch(e){
    D.inscriptionBoutiqueProducts=[];
    notify('warn','Catalogue boutique indisponible. La configuration reste possible en saisissant l’ID produit.','Boutique');
  }
  setTimeout(()=>{ try{ render(); }catch(e){} },0);
  return D.inscriptionBoutiqueProducts;
}

function setInscriptionOrderProducts(items){
  D.clubInfo=D.clubInfo||{};
  D.clubInfo.inscription_order_products=JSON.stringify(items.map(normalizeInscriptionOrderProduct));
}

function renderInscriptionOrderProductsRows(canWrite){
  const items=getInscriptionOrderProducts();
  if(!items.length) return `<div class="empty">Aucun produit additionnel configuré pour l'inscription.</div>`;
  return items.map((item,index)=>`
  <div class="card" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
  <div class="fg"><label>Source</label>
  <select ${canWrite?'':'disabled'} onchange="setInscriptionOrderProductField(${index},'source',this.value)">
  <option value="gestion" ${item.source==='gestion'?'selected':''}>Gestion</option>
  <option value="boutique" ${item.source==='boutique'?'selected':''}>Boutique</option>
  </select>
  </div>
  <div class="fg"><label>Actif</label>
  <select ${canWrite?'':'disabled'} onchange="setInscriptionOrderProductField(${index},'active',this.value==='true')">
  <option value="true" ${item.active!==false?'selected':''}>Oui</option>
  <option value="false" ${item.active===false?'selected':''}>Non</option>
  </select>
  </div>
  <div class="fg" style="grid-column:1/-1"><label>ID interne</label><input value="${esc(item.id)}" ${canWrite?'':'readonly'} onchange="setInscriptionOrderProductField(${index},'id',this.value)"></div>
  <div class="fg"><label>ID produit boutique</label><input value="${esc(item.boutiqueProductId||'')}" placeholder="ex: 12" ${canWrite?'':'readonly'} onchange="setInscriptionOrderProductField(${index},'boutiqueProductId',this.value)"></div>
  <div class="fg"><label>Produit boutique</label>
  <select ${canWrite?'':'disabled'} onchange="applyBoutiqueProductToInscriptionOrder(${index},this.value)">
  <option value="">Sélectionner</option>
  ${(D.inscriptionBoutiqueProducts||[]).map(p=>`<option value="${esc(p.id)}" ${String(item.boutiqueProductId||'')===String(p.id)?'selected':''}>${esc(p.name)} · ${Number(p.price||0).toFixed(2)} € · stock ${Number(p.stock||0)}</option>`).join('')}
  </select>
  </div>
  <div class="fg"><label>Nom</label><input value="${esc(item.name)}" ${canWrite?'':'readonly'} onchange="setInscriptionOrderProductField(${index},'name',this.value)"></div>
  <div class="fg"><label>Prix</label><input type="number" min="0" step="0.50" value="${Number(item.price||0)}" ${canWrite?'':'readonly'} onchange="setInscriptionOrderProductField(${index},'price',this.value)"></div>
  <div class="fg" style="grid-column:1/-1"><label>Description</label><input value="${esc(item.description)}" ${canWrite?'':'readonly'} onchange="setInscriptionOrderProductField(${index},'description',this.value)"></div>
  <div class="fg"><label>Qté par défaut nouvelle inscription</label><input type="number" min="0" step="1" value="${Number(item.defaultQtyNew||0)}" ${canWrite?'':'readonly'} onchange="setInscriptionOrderProductField(${index},'defaultQtyNew',this.value)"></div>
  <div class="fg"><label>Taille obligatoire</label>
  <select ${canWrite?'':'disabled'} onchange="setInscriptionOrderProductField(${index},'requiresSize',this.value==='true')">
  <option value="false" ${!item.requiresSize?'selected':''}>Non</option>
  <option value="true" ${item.requiresSize?'selected':''}>Oui</option>
  </select>
  </div>
  ${canWrite?`<div style="grid-column:1/-1;display:flex;justify-content:flex-end"><button class="btn" onclick="removeInscriptionOrderProduct(${index})">Supprimer</button></div>`:''}
  </div>
  `).join('');
}

function renderLogoNode(el,url,size,rounded){
  if(!el) return;
  el.textContent='';
  if(url){
    const img=document.createElement('img');
    img.src=url;
    img.alt='Logo du club';
    img.style.width=size||'100%';
    img.style.height=size||'100%';
    img.style.objectFit='contain';
    if(rounded) img.style.borderRadius='50%';
    el.appendChild(img);
    return;
  }
  const span=document.createElement('span');
  span.style.fontSize='28px';
  span.textContent='🥊';
  el.appendChild(span);
}

function diplomeFieldMeta(key){
  return DIPLOME_FIELD_META.find(f=>f.key===key) || {key,label:key};
}

function normalizeDiplomeField(key,raw){
  const base=DEFAULT_DIPLOME_FIELDS[key]||DEFAULT_DIPLOME_FIELDS.nomComplet;
  const field={...base,...(raw||{})};
  const meta=diplomeFieldMeta(key);
  field.enabled=field.enabled!==false;
  const left=parseFloat(field.left);
  const top=parseFloat(field.top);
  field.left=clamp(Number.isFinite(left)?left:base.left,0,100);
  field.top=clamp(Number.isFinite(top)?top:base.top,0,100);
  field.width=clamp(parseFloat(field.width)||base.width,4,100);
  field.height=clamp(parseFloat(field.height)||base.height||10,2,100);
  field.fontSize=clamp(parseFloat(field.fontSize)||base.fontSize||24,8,96);
  field.fontFamily=field.fontFamily||base.fontFamily;
  field.fontWeight=(field.fontWeight||base.fontWeight||'400').toString();
  field.fontStyle=(field.fontStyle==='italic'?'italic':'normal');
  field.align=['left','center','right'].includes(field.align)?field.align:(base.align||'center');
  field.color=(field.color||base.color||'#16110d').toString();
  field.letterSpacing=clamp(parseFloat(field.letterSpacing)||0,-2,20);
  field.objectFit=['contain','cover','fill'].includes(field.objectFit)?field.objectFit:(base.objectFit||'contain');
  field.type=meta.type||'text';
  return field;
}

function normalizeDiplomeTemplateLayout(raw){
  const src=raw&&typeof raw==='object'?raw:{};
  const fields={};
  Object.keys(DEFAULT_DIPLOME_FIELDS).forEach(key=>{
    fields[key]=normalizeDiplomeField(key,src.fields?.[key]||src[key]);
  });
  return {fields};
}

function loadDiplomeLayoutsFromClubInfo(){
  D.diplomeLayouts=normalizeDiplomeLayoutsObject(safeParseJSON(D.clubInfo?.[DIPLOME_LAYOUTS_KEY],{}));
}

function normalizeDiplomeLayoutsObject(raw){
  const out={};
  if(!raw||typeof raw!=='object') return out;
  Object.entries(raw).forEach(([path,layout])=>{
    if(!path) return;
    out[path]=normalizeDiplomeTemplateLayout(layout);
  });
  return out;
}

function ensureDiplomeLayout(path){
  if(!path) return normalizeDiplomeTemplateLayout();
  if(!D.diplomeLayouts[path]) D.diplomeLayouts[path]=normalizeDiplomeTemplateLayout();
  return D.diplomeLayouts[path];
}

function selectedDiplomeLayout(){
  return ensureDiplomeLayout(UI.diplome.templatePath || selectedDiplomeTemplate()?.path || '');
}

function selectedDiplomeField(){
  const fieldKey=UI.diplome.selectedField||'nomComplet';
  return selectedDiplomeLayout().fields[fieldKey] || selectedDiplomeLayout().fields.nomComplet;
}

function selectedDiplomeFieldMeta(){
  return diplomeFieldMeta(UI.diplome.selectedField||'nomComplet');
}

function selectDiplomeField(key){
  UI.diplome.selectedField=key;
  render();
}

function updateDiplomeField(key,prop,value){
  const layout=selectedDiplomeLayout();
  if(!layout.fields[key]) layout.fields[key]=normalizeDiplomeField(key,{});
  layout.fields[key]=normalizeDiplomeField(key,{...layout.fields[key],[prop]:value});
  render();
}

function updateDraggedFieldElement(key,field){
  const preview=document.getElementById('diplome-preview-surface');
  if(!preview) return;
  const nodes=[...preview.querySelectorAll('.dipl-field-box')];
  const node=nodes.find(el=>el.getAttribute('onclick')===`selectDiplomeField('${key}')`);
  if(!node) return;
  if(field.type==='image'){
    node.style.left=`${field.left}%`;
    node.style.top=`${field.top}%`;
    node.style.width=`${field.width}%`;
    node.style.height=`${field.height}%`;
    node.style.transform=diplomeFieldAnchorTransform(field.align);
  }else{
    node.style.left=`${field.left}%`;
    node.style.top=`${field.top}%`;
    node.style.width=`${field.width}%`;
    node.style.transform=diplomeFieldAnchorTransform(field.align);
  }
}

function syncDiplomeEditorInputs(field){
  const pairs=[
    ['Position X (%)','left'],
    ['Position Y (%)','top'],
  ];
  pairs.forEach(([,prop])=>{
    const input=[...document.querySelectorAll('.dipl-editor-grid input[type="number"]')].find(el=>{
      const label=el.closest('.fg')?.querySelector('label')?.textContent?.trim();
      return (prop==='left' && label==='Position X (%)') || (prop==='top' && label==='Position Y (%)');
    });
    if(input) input.value=String(Math.round((field[prop]||0)*10)/10);
  });
}

async function saveDiplomeLayouts(){
  if(!requireWritePerm('perm_adherents')) return;
  const payload=JSON.stringify(D.diplomeLayouts);
  const {error}=await SB.from('club_info').upsert({cle:DIPLOME_LAYOUTS_KEY,valeur:payload},{onConflict:'cle'});
  if(error) return alert('Erreur lors de la sauvegarde des réglages de diplôme : '+error.message);
  D.clubInfo[DIPLOME_LAYOUTS_KEY]=payload;
  alert('Réglages des diplômes sauvegardés.');
}

function resetCurrentDiplomeLayout(){
  const tpl=selectedDiplomeTemplate();
  if(!tpl) return;
  D.diplomeLayouts[tpl.path]=normalizeDiplomeTemplateLayout();
  render();
}

// ═══════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════

function apiUrl(path){
  return `${CLOUDFLARE_API_BASE}${path}`;
}

function clearSession(){
  const headers = {};
  if(AUTH_TOKEN) headers['Authorization'] = 'Bearer ' + AUTH_TOKEN;
  AUTH_TOKEN = null;
  return fetch(apiUrl('/admin/logout'),{
    method:'POST',
    headers,
    cache:'no-store'
  }).catch(function(){});
}

function buildStorageObjectUrl(bucket,path){  const base=bucket==='fullfighting-pdf'    ? '/api/storage/fullfighting-pdf'    : '/api/storage/storage';
  return `${base}/${String(path||'').split('/').map(encodeURIComponent).join('/')}`;
}

function getAdherentPublicRegistration(adherentId){
  if(!adherentId) return null;
  const matches=(D.publicRegistrations||[]).filter(r=>r.adherent_id===adherentId);
  if(!matches.length) return null;
  return matches.sort((a,b)=>(b.updated_at||b.created_at||'').localeCompare(a.updated_at||a.created_at||''))[0]||null;
}

function getRegistrationDocuments(registration){
  const docs=registration?.documents_json && typeof registration.documents_json==='object' ? registration.documents_json : {};
  const labels={
    photoIdentity:"Photo d'identité",
    medicalCertificate:"Certificat médical",
    passRegionDocument:"Justificatif Pass Région",
    proofDocument:"Justificatif tarif réduit",
  };
  return Object.entries(docs).map(([key,doc])=>{
    if(!doc?.bucket || !doc?.key) return null;
    return {
      key,
      label:labels[key]||key,
      name:doc.name||'document',
      url:buildStorageObjectUrl(doc.bucket,doc.key),
    };
  }).filter(Boolean);
}

function getAdherentDocuments(adherentId){
  return getRegistrationDocuments(getAdherentPublicRegistration(adherentId));
}

function clubLogoUrl(){
  return D.clubInfo?.logo || D.logoUrl || FORCED_LOGO_URL || '';
}

function storageProviderLabel(){
  return 'les fichiers statiques Cloudflare Pages';
}

async function apiRequest(path, options={}){
  const headers=new Headers(options.headers||{});
  if(options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')){
    headers.set('Content-Type','application/json');
  }
  if(AUTH_TOKEN && !headers.has('Authorization')){
    headers.set('Authorization','Bearer '+AUTH_TOKEN);
  }
  const res=await fetch(apiUrl(path),{
    method:options.method||'GET',
    headers,
    body:options.body,
    cache:'no-store'
  });
  let payload=null;
  try{payload=await res.json();}catch(e){payload=null;}
  if(!res.ok){
    if(res.status===401){
      clearSession();
      if(UI.currentUser){
        UI.currentUser=null;
        document.getElementById('app').style.display='none';
        showLoginScreen();
        notify('warn','Votre session a expiré. Reconnectez-vous pour continuer.','Session expirée');
      }
    }
    return {data:null,error:{message:payload?.error?.message||payload?.error||`HTTP ${res.status}`,status:res.status}};
  }
  if(payload && typeof payload==='object' && 'data' in payload){
    return {...payload,error:null};
  }
  return {data:payload,error:null};
}

class CloudflareQueryBuilder{
  constructor(table){
    this.table=table;
    this.query={op:'select',columns:'*',filters:[],single:false};
  }
  select(columns='*'){
    if(this.query.op==='insert' || this.query.op==='update' || this.query.op==='upsert' || this.query.op==='delete'){
      this.query.returning=true;
      this.query.columns=columns;
      return this;
    }
    this.query.op='select';
    this.query.columns=columns;
    return this;
  }
  insert(payload){this.query.op='insert';this.query.payload=payload;return this}
  update(payload){this.query.op='update';this.query.payload=payload;return this}
  delete(){this.query.op='delete';return this}
  upsert(payload,options={}){this.query.op='upsert';this.query.payload=payload;this.query.onConflict=options.onConflict;return this}
  eq(column,value){this.query.filters.push({op:'eq',column,value});return this}
  in(column,value){this.query.filters.push({op:'in',column,value});return this}
  order(column,options={}){this.query.order={column,ascending:options.ascending!==false};return this}
  limit(value){this.query.limit=value;return this}
  single(){this.query.single=true;return this}
  async execute(){
    return apiRequest(`/db/${encodeURIComponent(this.table)}`,{
      method:'POST',
      body:JSON.stringify(this.query),
    });
  }
  then(resolve,reject){
    return this.execute().then(resolve,reject);
  }
}

async function listStaticBucketFiles(bucket){
  const res=await fetch(buildStorageObjectUrl(bucket,'index.json'),{cache:'no-store'});
  if(!res.ok) return {data:[],error:null};
  const payload=await res.json();
  const files=Array.isArray(payload?.files)?payload.files:[];
  return {
    data:files.map(file=>({
      name:file.name,
      id:file.id||file.name,
      metadata:file.metadata||{mimetype:file.mimetype||'',size:file.size||0}
    })),
    error:null
  };
}

function createCloudflareClient(){
  return {
    from(table){
      return new CloudflareQueryBuilder(table);
    },
    storage:{
      from(bucket){
        return {
          async upload(path,file,options={}){
            const formData=new FormData();
            formData.append("file",file);
            const headers={};
            if(AUTH_TOKEN) headers['Authorization']='Bearer '+AUTH_TOKEN;
            const res=await fetch(apiUrl(`/storage/${bucket}/upload?path=${encodeURIComponent(path)}`),{method:"POST",headers,body:formData,credentials:"same-origin"});
            const payload=await res.json();
            return res.ok?{data:payload?.data,error:null}:{data:null,error:payload?.error||{message:"Upload failed"}};
          },
          getPublicUrl(path){
            return {data:{publicUrl:buildStorageObjectUrl(bucket,path)}};
          },
          async list(prefix='',options={}){
            const headers={};
            if(AUTH_TOKEN) headers['Authorization']='Bearer '+AUTH_TOKEN;
            const res2=await fetch(apiUrl(`/storage/${bucket}/list?prefix=${encodeURIComponent(prefix)}`),{headers,credentials:"same-origin"});
            const payload2=await res2.json();
            return res2.ok?{data:payload2?.data||[],error:null}:{data:[],error:payload2?.error};
          },
        };
      },
    },
  };
}

async function initCloudflareBackend(){
  try{
    const res=await fetch(apiUrl('/health'),{cache:'no-store'});
    if(!res.ok) return false;
    const payload=await res.json();
    if(!payload?.ok || !payload?.data?.bindings?.hasDb) return false;
    SB=createCloudflareClient();
    return true;
  }catch(e){
    return false;
  }
}

async function initBackend(){
  return initCloudflareBackend();
}

async function preloadClubBranding(){
  if(!SB) return;
  try{
    await loadCoreData(true);
  }catch(e){}
}

// ═══════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════
function showLoginScreen(){
  document.getElementById('login-screen').style.display='flex';
  D.logoUrl=clubLogoUrl();
  renderLogoNode(document.getElementById('login-logo'),D.logoUrl,'80px',true);
  if(D.clubInfo?.nom) document.getElementById('login-club-nom').textContent=D.clubInfo.nom;
  const err=document.getElementById('login-err');
  if(err){
    err.style.display='none';
    err.textContent='Email ou mot de passe incorrect';
  }
}

function setLoginError(message){
  const err=document.getElementById('login-err');
  if(!err) return;
  err.textContent=message || 'Email ou mot de passe incorrect';
  err.style.display='block';
}

async function doLogin(){
  const email=document.getElementById('l-email').value.trim().toLowerCase();
  const pwd=document.getElementById('l-pwd').value;
  const authRes=await apiRequest('/auth/login',{method:'POST',body:JSON.stringify({email,password:pwd})});
  const {data,error}=authRes;
  if(error||!data){
    if(error?.status===429){
      setLoginError('Trop de tentatives. Réessayez dans quelques minutes.');
    }else{
      setLoginError('Email ou mot de passe incorrect');
    }
    return;
  }
  document.getElementById('login-err').style.display='none';
  if(data.token) AUTH_TOKEN = data.token;
  UI.currentUser=normalizeUserRow(data.user||data);
  resetLoadedData();
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('cu-name').textContent=data.prenom||data.nom;
  document.getElementById('cu-role').textContent=ROLES[data.role]||data.role;
  await loadCoreData(true);
  await loadTabData(UI.tab,true);
  if(UI.tab==='diplomes') await loadDiplomeTemplates();
  renderTabs();render();
  notify('success',`Connexion réussie pour ${data.prenom||data.nom}.`,'Connexion');
  if(UI.currentUser?.must_change_password) setTimeout(forcePasswordRotation,120);
}

async function doLogout(){
  await clearSession();
  resetLoadedData();
  UI.currentUser=null;
  document.getElementById('app').style.display='none';
  showLoginScreen();
  notify('success','Vous avez été déconnecté.','Déconnexion');
}

function cloneRolePerms(src){
  return JSON.parse(JSON.stringify(src||DEFAULT_ROLE_PERMS));
}

function normalizeRolePerms(raw){
  const base=cloneRolePerms(DEFAULT_ROLE_PERMS);
  if(!raw||typeof raw!=='object') return base;
  Object.keys(base).forEach(role=>{
    const rp=raw[role];
    if(!rp||typeof rp!=='object') return;
    PERM_META.forEach(([perm])=>{
      if(typeof rp[perm]==='boolean' || typeof rp[perm]==='number') base[role][perm]=rp[perm]?'write':'none';
      else if(typeof rp[perm]==='string' && PERM_LEVELS[rp[perm]]) base[role][perm]=rp[perm];
    });
  });
  base.admin=cloneRolePerms(DEFAULT_ROLE_PERMS).admin;
  return base;
}

function deriveRolePermsFromUsers(users){
  const perms=cloneRolePerms(DEFAULT_ROLE_PERMS);
  Object.keys(ROLES).forEach(role=>{
    if(role==='admin') return;
    const sample=(users||[]).find(u=>u.role===role);
    if(!sample) return;
    PERM_META.forEach(([perm])=>{
      if(typeof sample[perm]==='boolean' || typeof sample[perm]==='number') perms[role][perm]=sample[perm]?'write':'none';
      else if(typeof sample[perm]==='string' && PERM_LEVELS[sample[perm]]) perms[role][perm]=sample[perm];
    });
  });
  return perms;
}

function getRolePerms(role){
  return D.rolePerms?.[role]||DEFAULT_ROLE_PERMS[role]||{};
}

function permLevelRank(level){
  return PERM_LEVELS[level]?.rank||0;
}

function getExplicitUserPermLevel(user, perm){
  const value=user?.[perm];
  if(value===null || value===undefined) return null; // pas de surcharge → utiliser le rôle
  if(typeof value==='boolean') return value?'write':'none';
  if(typeof value==='number') return value?'write':'none';
  if(typeof value==='string' && PERM_LEVELS[value]) return value;
  if(value==='1') return 'write';
  if(value==='0') return 'none';
  return null;
}

function getUserPermLevel(p){
  if(!UI.currentUser) return false;
  if(UI.currentUser.role==='admin') return 'write';
  const explicit=getExplicitUserPermLevel(UI.currentUser,p);
  if(explicit) return explicit;
  return getRolePerms(UI.currentUser.role)[p]||'none';
}

function hasPerm(p,mode='read'){
  if(!UI.currentUser) return false;
  const need=mode==='write'?2:1;
  return permLevelRank(getUserPermLevel(p))>=need;
}

function requireWritePerm(p,msg){
  if(hasPerm(p,'write')) return true;
  alert(msg||"Vous disposez d'un accès en lecture seule sur cette rubrique.");
  return false;
}

// ═══════════════════════════════════════════════════
// CHARGEMENT
// ═══════════════════════════════════════════════════
async function loadAll(){
  resetLoadedData();
  await loadCoreData(true);
  await Promise.all([
    loadTabData('adherents',true),
                    loadTabData('banque',true),
                    loadTabData('comptabilite',true),
                    loadTabData('achat',true),
                    loadTabData('facture',true),
                    loadTabData('administration',true),
  ]);
  await loadDiplomeTemplates();
  if(!UI.diplome.adherentId && D.adherents.length){
    UI.diplome.adherentId=D.adherents[0].id;
  }
  if(UI.diplome.adherentId){
    const adhSel=D.adherents.find(a=>a.id===UI.diplome.adherentId);
    if(adhSel && (!UI.diplome.templatePath || !D.diplomeTemplates.find(t=>t.path===UI.diplome.templatePath))){
      UI.diplome.templatePath=guessDiplomeTemplateForAdherent(adhSel);
    }
  }
  renderTabs(); render();
}

// ═══════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════
function renderTabs(){
  const vis=ALL_TABS.filter(t=>!t.perm || hasPerm(t.perm));
  document.getElementById('tabs-bar').innerHTML=vis.map(t=>`<button class="tab-btn ${UI.tab===t.id?'active':''}" onclick="showTab('${t.id}')">${t.icon} ${t.label}</button>`).join('');
  if(!vis.find(t=>t.id===UI.tab)&&vis.length>0) UI.tab=vis[0].id;
}
function needsLoadedTab(tab){
  return ['dashboard','adherents','diplomes','banque','comptabilite','achat','facture','administration','feedback'].includes(tab);
}
async function ensureCurrentTabData(){
  const target=UI.tab==='diplomes'?'adherents':UI.tab;
  if(!needsLoadedTab(UI.tab)) return;
  if(target==='adherents' && UI.tab==='diplomes' && !D.diplomeTemplates.length){
    await Promise.all([loadTabData(target),loadDiplomeTemplates()]);
    return;
  }
  await loadTabData(target);
}
async function showTab(t){
  UI.tab=t;
  renderTabs();
  render();
  await ensureCurrentTabData();
  render();
}
function showST(s,t){UI.subTab[s]=t;render()}
function canWriteCurrentTab(){
  const tab=ALL_TABS.find(x=>x.id===UI.tab);
  return tab?.perm?hasPerm(tab.perm,'write'):false;
}

function render(){
  if(!UI.currentUser) return;
  const c=document.getElementById('tab-content');
  if(needsLoadedTab(UI.tab) && !D.loaded[UI.tab==='diplomes'?'adherents':UI.tab] && D.loading[UI.tab==='diplomes'?'adherents':UI.tab]){
    c.innerHTML=`<div class="empty">Chargement de la rubrique…</div>`;
    return;
  }
  const map={dashboard:vDashboard,services:vServices,adherents:vAdh,diplomes:vDiplomes,banque:vBanque,comptabilite:vCompta,achat:vAchat,facture:vFacture,feedback:vFeedback,administration:vAdmin};
  c.innerHTML=(map[UI.tab]||vAdh)();
  renderModal();
  updLogo();
  if(UI.tab==='diplomes') refreshDiplomePreviewCanvas();
  if(UI.tab==='services' && !UI.servicesAutoChecked){
    UI.servicesAutoChecked=true;
    checkServiceStatus();
  }
  if(UI.tab!=='services') UI.servicesAutoChecked=false; // permet une nouvelle auto-vérification à la prochaine visite de l'onglet
}

function updLogo(){
  D.logoUrl=clubLogoUrl();
  renderLogoNode(document.getElementById('global-logo'),D.logoUrl,'100%',false);
}

const AFFBC_SERVICES = [
  {id:'site', label:'Site public', url:'https://americanfullfightingbons.fr', version:'https://americanfullfightingbons.fr/api/version'},
{id:'inscription', label:'Inscriptions', url:'https://inscription.americanfullfightingbons.fr', version:'https://inscription.americanfullfightingbons.fr/api/version'},
{id:'calendrier', label:'Calendrier', url:'https://calendrier.americanfullfightingbons.fr', version:'https://calendrier.americanfullfightingbons.fr/api/version'},
{id:'boutique', label:'Boutique', url:'https://boutique.americanfullfightingbons.fr', version:'https://boutique.americanfullfightingbons.fr/api/version'},
{id:'gestion', label:'Gestion', url:'https://gestion.americanfullfightingbons.fr', version:'https://gestion.americanfullfightingbons.fr/api/version'},
];

function vServices(){
  return `<div class="view-head">
  <div>
  <div class="eyebrow">Supervision</div>
  <h2>État des services AFFBC</h2>
  <p>Contrôlez rapidement que chaque site répond et ouvrez les interfaces publiées.</p>
  </div>
  <button class="btn primary" onclick="checkServiceStatus()">Vérifier maintenant</button>
  </div>
  <div class="grid">
  ${AFFBC_SERVICES.map(service=>`<div class="dash-card" id="service-${service.id}">
  <h3>${esc(service.label)}</h3>
  <div class="dash-stat-value" id="service-${service.id}-state">Non vérifié</div>
  <p id="service-${service.id}-detail">${esc(service.url)}</p>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
  <a class="btn sm" href="${esc(service.url)}" target="_blank" rel="noopener noreferrer">Ouvrir</a>
  <button class="btn sm" onclick="checkOneService('${service.id}')">Tester</button>
  </div>
  </div>`).join('')}
  </div>`;
}

async function checkOneService(id){
  const service=AFFBC_SERVICES.find(item=>item.id===id);
  if(!service) return;
  const state=document.getElementById(`service-${id}-state`);
  const detail=document.getElementById(`service-${id}-detail`);
  if(state) state.textContent='Vérification...';
  try{
    const started=performance.now();
    const res=await fetch(service.version,{cache:'no-store'});
    const json=await res.json().catch(()=>null);
    const payload=json?.data||json||{};
    const ms=Math.round(performance.now()-started);
    if(!res.ok || json?.ok===false) throw new Error(`HTTP ${res.status}`);
    if(state) state.textContent='OK';
    if(detail) detail.textContent=`${payload.service||service.label} · ${payload.version||'version inconnue'} · ${ms} ms`;
  }catch(error){
    if(state) state.textContent='Erreur';
    if(detail) detail.textContent=error?.message||'Service indisponible';
  }
}

function checkServiceStatus(){
  AFFBC_SERVICES.forEach(service=>checkOneService(service.id));
}

// ═══════════════════════════════════════════════════
// ADHÉRENTS
// ═══════════════════════════════════════════════════
function adhStatus(a){
  if(!a.date_fin_adhesion) return 'unknown';
  const diff=(new Date(a.date_fin_adhesion)-new Date())/(1000*60*60*24);
  if(diff<0) return 'expire';
  if(diff<30) return 'soon';
  return 'valid';
}
function adhBadge(a){
  const s=adhStatus(a);
  if(s==='valid')  return`<span class="badge bok">✓ Valide</span>`;
  if(s==='soon')   return`<span class="badge bwarn">⚠ Bientôt</span>`;
  if(s==='expire') return`<span class="badge bno">✗ Expirée</span>`;
  return`<span class="badge bgray">—</span>`;
}

function currentSeasonLabel(ref=new Date()){
  const y=ref.getFullYear();
  const m=ref.getMonth()+1;
  const start=m>=9?y:y-1;
  return `${start}-${start+1}`;
}

function seasonFromDate(dateStr){
  if(!dateStr) return '';
  const d=new Date(dateStr);
  if(Number.isNaN(d.getTime())) return '';
  return currentSeasonLabel(d);
}

function seasonBounds(label){
  const m=(label||'').match(/^(\d{4})-(\d{4})$/);
  if(!m) return null;
  return {start:`${m[1]}-09-01`,end:`${m[2]}-08-31`};
}

function defaultAdhesionEnd(dateStr){
  const d=dateStr?new Date(dateStr):new Date();
  if(Number.isNaN(d.getTime())) return '';
  const season=currentSeasonLabel(d);
  const b=seasonBounds(season);
  return b?.end||'';
}

function onAdhTypeChange(value){
  const pay=document.getElementById('f-pay');
  const cot=document.getElementById('f-cot');
  if(!pay||!cot) return;
  if(value==='Membre du Bureau'){
    pay.value='Gratuit';
    cot.value='0';
  }else if(pay.value==='Gratuit'){
    pay.value='Virement';
  }
}

function adhStatutBadge(statut){
  if(statut==='Actif') return 'bok';
  if(statut==='Renouvellement') return 'bblue';
  if(statut==='Adhésion annulée') return 'bno';
  return 'bgray';
}

function compareFrDates(a,b){
  const norm=s=>frDateToISO(s)||(s||'').split('T')[0]||(s||'');
  const da=norm(a),db=norm(b);
  return da<db?-1:da>db?1:0;
}

function frDateToISO(v){
  if(!v) return null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m=(v||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m?`${m[3]}-${m[2]}-${m[1]}`:null;
}

function transactionFingerprint(t){
  return [
    t.compte_id||'',
    frDateToISO(t.date_op)||t.date_op||'',
    frDateToISO(t.date_valeur)||t.date_valeur||'',
    (t.libelle||'').replace(/\s+/g,' ').trim().toLowerCase(),
    (+t.debit||0).toFixed(2),
    (+t.credit||0).toFixed(2)
  ].join('|');
}

function euro(value){
  return (+value||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
}

function paginateList(list,pageKey,pageSize=15){
  const totalPages=Math.max(1,Math.ceil((list||[]).length/pageSize));
  UI.paging[pageKey]=Math.min(Math.max(UI.paging[pageKey]||1,1),totalPages);
  const start=(UI.paging[pageKey]-1)*pageSize;
  return {
    totalPages,
    currentPage:UI.paging[pageKey],
    rows:(list||[]).slice(start,start+pageSize),
  };
}

function renderPager(pageKey,totalPages){
  if(totalPages<=1) return '';
  return `<div style="display:flex;justify-content:flex-end;gap:8px;align-items:center;margin-top:12px">
  <button class="btn sm" ${UI.paging[pageKey]<=1?'disabled':''} onclick="UI.paging.${pageKey}=Math.max(1,(UI.paging.${pageKey}||1)-1);render()">Précédent</button>
  <span style="font-size:12px;color:var(--txt2)">Page ${UI.paging[pageKey]} / ${totalPages}</span>
  <button class="btn sm" ${UI.paging[pageKey]>=totalPages?'disabled':''} onclick="UI.paging.${pageKey}=Math.min(${totalPages},(UI.paging.${pageKey}||1)+1);render()">Suivant</button>
  </div>`;
}

function normalizeFactureStatus(status,dateOp){
  const raw=(status||'').trim();
  if(raw==='Payée' || raw==='Annulée' || raw==='Brouillon' || raw==='Émise' || raw==='En retard') return raw;
  if(raw==='Émise' || raw==='emise') return 'Émise';
  if(raw==='Payee' || raw==='Payé' || raw==='Réglée' || raw==='Reglee') return 'Payée';
  if(raw==='Annulee' || raw==='Annulée') return 'Annulée';
  if(!dateOp) return raw||'Brouillon';
  const age=(Date.now()-new Date(dateOp).getTime())/(1000*60*60*24);
  if(age>30) return 'En retard';
  return raw||'Émise';
}

function factureStatusBadge(status){
  if(status==='Payée') return 'bok';
  if(status==='En retard') return 'bno';
  if(status==='Annulée') return 'bgray';
  if(status==='Brouillon') return 'bwarn';
  return 'bblue';
}

function roleFocusLabel(){
  const role=UI.currentUser?.role||'membre';
  if(role==='admin') return 'Vue transverse du club, avec suivi des opérations, des dossiers et des accès.';
  if(role==='tresorier') return 'Suivi prioritaire des flux financiers, des achats et de la facturation.';
  if(role==='secretaire') return 'Vue orientée adhérents, renouvellements et dossiers administratifs.';
  if(role==='entraineur') return 'Vue synthétique pour suivre les licenciés, les échéances et les ceintures.';
  return 'Vue synthétique des informations accessibles pour votre profil.';
}

function dashboardData(){
  const adherents=D.adherents||[];
  const achats=D.achats||[];
  const factures=(D.factures||[]).map(f=>({...f,statut:normalizeFactureStatus(f.statut,f.date_op)}));
  const journal=D.journal||[];
  const comptes=D.comptes||[];
  const monthPrefix=td().slice(0,7);
  const prevMonthDate=new Date();
  prevMonthDate.setMonth(prevMonthDate.getMonth()-1);
  const prevMonthPrefix=prevMonthDate.toISOString().slice(0,7);
  const paidInvoiceStatuses=new Set(['Payée','Payee','Réglée','Reglee']);
  const openInvoiceStatuses=new Set(['Émise','Emise','En retard','Brouillon']);
  const pendingBuyStatuses=new Set(['nouveau','valide']);
  const paidBuyStatuses=new Set(['paye']);
  const adherentsSoon=adherents.filter(a=>adhStatus(a)==='soon');
  const adherentsExpired=adherents.filter(a=>adhStatus(a)==='expire');
  const renewList=adherents.filter(a=>a.statut==='Renouvellement');
  const incompleteList=adherents.filter(a=>!a.certificat || !a.droit_image || !a.reglement);
  const currentSeason=currentSeasonLabel();
  const currentSeasonAdherents=adherents.filter(a=>seasonFromDate(a.date_fin_adhesion||a.date_inscription)===currentSeason);
  const totalBank=comptes.reduce((sum,c)=>sum+(+c.solde_initial||0)+(c.transactions||[]).reduce((acc,t)=>acc+(+t.credit||0)-(+t.debit||0),0),0);
  const bankTransactions=comptes.flatMap(c=>(c.transactions||[]).map(t=>({...t,compte_nom:c.nom||'Compte'})));
  const unreconciledTransactions=bankTransactions.filter(t=>!t.rapproche);
  const monthEntriesList=journal.filter(j=>(j.date_op||'').slice(0,7)===monthPrefix);
  const prevMonthEntriesList=journal.filter(j=>(j.date_op||'').slice(0,7)===prevMonthPrefix);
  const exoJournal=journal.filter(j=>j.exercice_id===D.currentExo?.id);
  const totalDebit=exoJournal.reduce((sum,j)=>sum+(+j.debit||0),0);
  const totalCredit=exoJournal.reduce((sum,j)=>sum+(+j.credit||0),0);
  const accountingGap=Math.round((totalDebit-totalCredit)*100)/100;
  const purchasesPending=achats.filter(a=>pendingBuyStatuses.has((a.statut||'').trim().toLowerCase()));
  const purchasesPaid=achats.filter(a=>paidBuyStatuses.has((a.statut||'').trim().toLowerCase()));
  const purchasesRefused=achats.filter(a=>(a.statut||'').trim().toLowerCase()==='refuse');
  const pendingBuyAmount=purchasesPending.reduce((sum,a)=>sum+(+a.montant||0),0);
  const paidBuyAmount=purchasesPaid.reduce((sum,a)=>sum+(+a.montant||0),0);
  const invoicesOpen=factures.filter(f=>openInvoiceStatuses.has((f.statut||'').trim()));
  const invoicesPaid=factures.filter(f=>paidInvoiceStatuses.has((f.statut||'').trim()));
  const invoiceAmount=rows=>(rows||[]).reduce((sum,f)=>sum+(f.lignes||[]).reduce((acc,l)=>acc+(+l.qte||0)*(+l.pu||0),0),0);
  const openInvoiceAmount=invoiceAmount(invoicesOpen);
  const paidInvoiceAmount=invoiceAmount(invoicesPaid);
  const monthInvoices=factures.filter(f=>(f.date_op||'').slice(0,7)===monthPrefix);
  const prevMonthInvoices=factures.filter(f=>(f.date_op||'').slice(0,7)===prevMonthPrefix);
  const monthInvoiceAmount=invoiceAmount(monthInvoices);
  const prevMonthInvoiceAmount=invoiceAmount(prevMonthInvoices);
  const monthBuys=achats.filter(a=>(a.date_op||'').slice(0,7)===monthPrefix);
  const prevMonthBuys=achats.filter(a=>(a.date_op||'').slice(0,7)===prevMonthPrefix);
  const monthBuyAmount=monthBuys.reduce((sum,a)=>sum+(+a.montant||0),0);
  const prevMonthBuyAmount=prevMonthBuys.reduce((sum,a)=>sum+(+a.montant||0),0);
  const donations=factures.filter(isDonationReceipt);
  const donationAmount=invoiceAmount(donations);
  const recentInvoices=[...factures].sort((a,b)=>(b.date_op||'').localeCompare(a.date_op||'')).slice(0,4);
  const recentBuys=[...achats].sort((a,b)=>(b.date_op||'').localeCompare(a.date_op||'')).slice(0,4);
  const recentEntries=[...journal].sort((a,b)=>(b.date_op||'').localeCompare(a.date_op||'')).slice(0,4);
  const recentTransactions=[...bankTransactions].sort((a,b)=>(b.date_op||'').localeCompare(a.date_op||'')).slice(0,4);
  const alerts=[];
  if(hasPerm('perm_adherents') && renewList.length) alerts.push({title:`${renewList.length} adhésion(s) à renouveler`,detail:'Statut de renouvellement détecté dans la base adhérents.',tab:'adherents',badge:'bwarn'});
  if(hasPerm('perm_adherents') && adherentsExpired.length) alerts.push({title:`${adherentsExpired.length} adhésion(s) expirée(s)`,detail:'Des adhérents ont dépassé leur date de fin d’adhésion.',tab:'adherents',badge:'bno'});
  if(hasPerm('perm_adherents') && incompleteList.length) alerts.push({title:`${incompleteList.length} dossier(s) incomplet(s)`,detail:'Certificat, droit à l’image ou règlement intérieur manquants.',tab:'adherents',badge:'bwarn'});
  if(hasPerm('perm_banque') && unreconciledTransactions.length) alerts.push({title:`${unreconciledTransactions.length} transaction(s) non rapprochée(s)`,detail:'Le rapprochement bancaire reste à finaliser.',tab:'banque',badge:'bwarn'});
  if(hasPerm('perm_comptabilite') && accountingGap!==0) alerts.push({title:`Journal déséquilibré de ${euro(accountingGap)}`,detail:'Le total débit / crédit de l’exercice actif n’est pas équilibré.',tab:'comptabilite',badge:'bno'});
  if(hasPerm('perm_achats') && purchasesPending.length) alerts.push({title:`${purchasesPending.length} achat(s) à traiter`,detail:'Des dépenses sont encore en attente de validation ou de paiement.',tab:'achat',badge:'bwarn'});
  if(hasPerm('perm_facturation') && invoicesOpen.length) alerts.push({title:`${invoicesOpen.length} facture(s) ouvertes`,detail:'Des ventes restent à encaisser ou à clôturer.',tab:'facture',badge:'bwarn'});
  alerts.sort((a,b)=>{
    const score=x=>x.badge==='bno'?2:x.badge==='bwarn'?1:0;
    return score(b)-score(a);
  });
  return {
    adherents,achats,factures,journal,comptes,currentSeason,currentSeasonAdherents,
    adherentsSoon,adherentsExpired,renewList,incompleteList,
    totalBank,bankTransactions,unreconciledTransactions,monthEntriesList,prevMonthEntriesList,exoJournal,totalDebit,totalCredit,accountingGap,
    purchasesPending,purchasesPaid,purchasesRefused,pendingBuyAmount,paidBuyAmount,
    invoicesOpen,invoicesPaid,openInvoiceAmount,paidInvoiceAmount,monthInvoices,prevMonthInvoices,monthInvoiceAmount,prevMonthInvoiceAmount,monthBuys,prevMonthBuys,monthBuyAmount,prevMonthBuyAmount,donations,donationAmount,
    recentInvoices,recentBuys,recentEntries,recentTransactions,alerts
  };
}

function dashboardDelta(current, previous, suffix=''){
  const delta=(+current||0)-(+previous||0);
  const cls=delta>0?'up':delta<0?'down':'flat';
  const sign=delta>0?'+':'';
  return {
    delta,
    cls,
    label:`${sign}${suffix==='€'?euro(delta):`${delta}${suffix}`}` + ` vs mois précédent`
  };
}

function monthKeyFromOffset(offset){
  const date=new Date();
  date.setDate(1);
  date.setMonth(date.getMonth()+offset);
  return date.toISOString().slice(0,7);
}

function monthLabelFromKey(key){
  const [y,m]=String(key||'').split('-');
  if(!y||!m) return key||'';
  return new Date(Number(y),Number(m)-1,1).toLocaleDateString('fr-FR',{month:'short'});
}

function buildMonthSeries(valuesByMonth, months=6){
  const items=[];
  for(let offset=-(months-1);offset<=0;offset++){
    const key=monthKeyFromOffset(offset);
    items.push({key,label:monthLabelFromKey(key),value:+(valuesByMonth[key]||0)});
  }
  return items;
}

function sumByMonth(rows,dateKey,valueFn){
  const out={};
  (rows||[]).forEach(row=>{
    const key=(row?.[dateKey]||'').slice(0,7);
    if(!key) return;
    out[key]=(out[key]||0)+(+valueFn(row)||0);
  });
  return out;
}

function countByMonth(rows,dateKey){
  return sumByMonth(rows,dateKey,()=>1);
}

function achatMatchesFilter(achat, status){
  const current=(achat?.statut||'').trim().toLowerCase();
  if(!status) return true;
  if(status==='pending') return current==='nouveau' || current==='valide';
  return current===status;
}

function factureMatchesFilter(facture, status){
  const current=normalizeFactureStatus(facture?.statut, facture?.date_op);
  if(!status) return true;
  if(status==='open') return current==='Émise' || current==='Brouillon' || current==='En retard';
  return current===status;
}

function adherentMatchesSpecialFilter(adherent, special){
  if(!special) return true;
  if(special==='incomplete') return !adherent.certificat || !adherent.droit_image || !adherent.reglement;
  if(special==='renew') return adherent.statut==='Renouvellement';
  if(special==='expired') return adhStatus(adherent)==='expire';
  if(special==='soon') return adhStatus(adherent)==='soon';
  return true;
}

function renderBarChart(series,color='#B33627'){
  const width=320, height=120, pad=10, barW=32;
  const max=Math.max(...series.map(s=>s.value),1);
  const gap=(width-pad*2-barW*series.length)/Math.max(series.length-1,1);
  const bars=series.map((item,index)=>{
    const h=Math.round((item.value/max)*72);
    const x=pad+index*(barW+gap);
    const y=84-h;
    return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="8" fill="${color}" opacity="${index===series.length-1?'1':'0.72'}"></rect>
    <text x="${x+barW/2}" y="98" text-anchor="middle" font-size="10" fill="#6d6259">${esc(item.label)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">
  <line x1="${pad}" y1="84.5" x2="${width-pad}" y2="84.5" stroke="rgba(62,39,24,.18)" />
  ${bars}
  </svg>`;
}

function renderLineChart(series,color='#245a9b'){
  const width=320, height=120, padX=12, top=12, bottom=32;
  const max=Math.max(...series.map(s=>s.value),1);
  const step=(width-padX*2)/Math.max(series.length-1,1);
  const points=series.map((item,index)=>{
    const x=padX+index*step;
    const y=top+(1-(item.value/max))*(height-top-bottom);
    return {x,y,item};
  });
  const polyline=points.map(p=>`${p.x},${p.y}`).join(' ');
  return `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">
  <polyline fill="none" stroke="${color}" stroke-width="3" points="${polyline}" />
  ${points.map((p,index)=>`<circle cx="${p.x}" cy="${p.y}" r="${index===points.length-1?4:3}" fill="${color}" />
  <text x="${p.x}" y="${height-14}" text-anchor="middle" font-size="10" fill="#6d6259">${esc(p.item.label)}</text>`).join('')}
  </svg>`;
}

function renderGauge(value,total,color='#1e7e34'){
  const safeTotal=Math.max(total||0,1);
  const ratio=Math.max(0,Math.min(1,(value||0)/safeTotal));
  const radius=42, circumference=2*Math.PI*radius, offset=circumference*(1-ratio);
  return `<svg viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="60" r="${radius}" fill="none" stroke="rgba(62,39,24,.12)" stroke-width="12"></circle>
  <circle cx="60" cy="60" r="${radius}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"
  stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" transform="rotate(-90 60 60)"></circle>
  <text x="60" y="56" text-anchor="middle" font-size="24" font-weight="700" fill="#26160f">${Math.round(ratio*100)}%</text>
  <text x="60" y="74" text-anchor="middle" font-size="10" fill="#6d6259">complet</text>
  </svg>`;
}

async function focusAdherentsIssue(mode=''){
  UI.search.adherents='';
  UI.adhFilters={...UI.adhFilters,special:mode,season:mode?'all':UI.adhFilters.season||'current'};
  await showTab('adherents');
  render();
}

async function focusAchats(status=''){
  UI.search.achats='';
  UI.achatFilterStatus=status;
  await showTab('achat');
  render();
}

async function focusFactures(status=''){
  UI.search.factures='';
  UI.factureFilterStatus=status;
  UI.subTab.facture='liste';
  await showTab('facture');
  render();
}

async function focusBanqueRapprochement(autoSuggest=false){
  UI.subTab.banque='rappr';
  await showTab('banque');
  render();
  if(autoSuggest) setTimeout(()=>preselectRapprochements(),60);
}

async function focusComptabiliteJournal(){
  UI.subTab.compta='journal';
  await showTab('comptabilite');
  render();
}

async function focusComptabiliteAssistant(){
  UI.subTab.compta='journal';
  await showTab('comptabilite');
  render();
  setTimeout(()=>openEquilibreAssistant(),60);
}

async function openNewFacture(){
  await showTab('facture');
  nouvFac();
}

function buildDashboardAttentionItems(d){
  const items=[];
  if(hasPerm('perm_adherents') && d.renewList.length){
    items.push({
      title:`${d.renewList.length} adhésion(s) à renouveler`,
               detail:'Préparer la nouvelle saison, confirmer le règlement et mettre à jour les pièces si besoin.',
               advice:'Traiter d’abord les renouvellements avec cotisation encaissée pour fiabiliser les listes de cours et les reçus.',
               badge:'bwarn',
               badgeText:'Renouvellement',
               actions:[
                 {label:'Filtrer les renouvellements',onclick:"focusAdherentsIssue('renew')",primary:true},
               {label:'Voir les adhérents',onclick:"showTab('adherents')"}
               ]
    });
  }
  if(hasPerm('perm_adherents') && d.adherentsExpired.length){
    items.push({
      title:`${d.adherentsExpired.length} adhésion(s) expirée(s)`,
               detail:'Des fiches ont dépassé leur date de fin d’adhésion et doivent être régularisées ou clôturées.',
               advice:'Archive ou renouvelle rapidement ces dossiers pour éviter des relances inutiles et des listes sportives fausses.',
               badge:'bno',
               badgeText:'Bloquant',
               actions:[
                 {label:'Voir les expirés',onclick:"focusAdherentsIssue('expired')",primary:true},
               {label:'Nouvel adhérent',onclick:"openModal('adh')",show:hasPerm('perm_adherents','write')}
               ]
    });
  }
  if(hasPerm('perm_adherents') && d.incompleteList.length){
    items.push({
      title:`${d.incompleteList.length} dossier(s) incomplet(s)`,
               detail:'Certificat, droit à l’image ou règlement intérieur manquants sur une partie des fiches.',
               advice:'Commence par les dossiers actifs de la saison en cours puis demande les pièces manquantes en lot, pas au cas par cas.',
               badge:'bwarn',
               badgeText:'Documents',
               actions:[
                 {label:'Filtrer les incomplets',onclick:"focusAdherentsIssue('incomplete')",primary:true},
               {label:'Exporter les adhérents',onclick:"exportCSV()"}
               ]
    });
  }
  if(hasPerm('perm_banque') && d.unreconciledTransactions.length){
    items.push({
      title:`${d.unreconciledTransactions.length} transaction(s) non rapprochée(s)`,
               detail:'Le rapprochement bancaire n’est pas terminé sur les mouvements importés.',
               advice:'Lance une pré-sélection, contrôle les montants proposés puis valide chaque ligne douteuse avant le tout-rapprocher.',
               badge:'bwarn',
               badgeText:'Banque',
               actions:[
                 {label:'Ouvrir le rapprochement',onclick:"focusBanqueRapprochement(true)",primary:true},
               {label:'Voir la banque',onclick:"showTab('banque')"}
               ]
    });
  }
  if(hasPerm('perm_comptabilite') && d.accountingGap!==0){
    items.push({
      title:`Journal déséquilibré de ${euro(d.accountingGap)}`,
               detail:'Le débit et le crédit ne se compensent pas sur l’exercice actif.',
               advice:'Passe d’abord par l’assistant de déséquilibre, puis régularise uniquement les pièces justifiées pour éviter un 471 inutile.',
               badge:'bno',
               badgeText:'Compta',
               actions:[
                 {label:'Ouvrir l’assistant',onclick:"focusComptabiliteAssistant()",primary:true},
               {label:'Voir le journal',onclick:"focusComptabiliteJournal()"}
               ]
    });
  }
  if(hasPerm('perm_achats') && d.purchasesPending.length){
    items.push({
      title:`${d.purchasesPending.length} achat(s) à traiter`,
               detail:'Des dépenses sont encore à valider ou à passer en payé avec leur justificatif.',
               advice:'Traite en priorité les achats avec montant élevé ou sans justificatif pour garder une vision de trésorerie exploitable.',
               badge:'bwarn',
               badgeText:'Achats',
               actions:[
                 {label:'Filtrer les achats en attente',onclick:"focusAchats('pending')",primary:true},
               {label:'Nouvel achat',onclick:"openModal('achat')",show:hasPerm('perm_achats','write')}
               ]
    });
  }
  if(hasPerm('perm_facturation') && d.invoicesOpen.length){
    items.push({
      title:`${d.invoicesOpen.length} facture(s) ouverte(s)`,
               detail:'Des ventes sont encore émises ou en retard et doivent être suivies jusqu’à l’encaissement.',
               advice:'Passe en payé les ventes réellement encaissées et marque en retard celles à relancer pour distinguer l’encours du retard.',
               badge:'bwarn',
               badgeText:'Ventes',
               actions:[
                 {label:'Filtrer les ventes ouvertes',onclick:"focusFactures('open')",primary:true},
               {label:'Nouvelle vente',onclick:"openNewFacture()",show:hasPerm('perm_facturation','write')}
               ]
    });
  }
  return items.map(item=>({
    ...item,
    actions:(item.actions||[]).filter(action=>action.show!==false)
  }));
}

function buildDashboardOptimizationTips(d){
  const tips=[];
  if(hasPerm('perm_banque') && d.unreconciledTransactions.length>5){
    tips.push('Passe le rapprochement bancaire chaque semaine plutôt qu’en fin de mois pour limiter les recherches de pièces.');
  }
  if(hasPerm('perm_facturation') && d.invoicesOpen.length){
    tips.push('Utilise les statuts `Payée` et `En retard` dès qu’une vente évolue pour fiabiliser l’encours à encaisser.');
  }
  if(hasPerm('perm_adherents') && d.incompleteList.length){
    tips.push('Prévois une relance groupée des pièces manquantes afin de réduire les dossiers incomplets en une seule campagne.');
  }
  if(hasPerm('perm_achats') && d.purchasesPending.length){
    tips.push('Ajoute le justificatif PDF et la référence de paiement au moment du règlement pour éviter les reprises comptables plus tard.');
  }
  if(hasPerm('perm_comptabilite') && d.accountingGap!==0){
    tips.push('Corrige les déséquilibres avant toute clôture d’exercice, sinon le contrôle de fin de période perd en valeur.');
  }
  if(!tips.length){
    tips.push('La situation est propre: conserve un rythme hebdomadaire de rapprochement, mensuel de compta et saisonnier sur les adhésions.');
  }
  return tips.slice(0,4);
}

function vDashboard(){
  const d=dashboardData();
  const attentionItems=buildDashboardAttentionItems(d);
  const optimizationTips=buildDashboardOptimizationTips(d);
  const activeAlerts=d.alerts.length;
  const urgentLabel=activeAlerts?`${activeAlerts} point(s) à traiter`:'Aucun blocage prioritaire détecté';
  const financeBalance=d.paidInvoiceAmount-d.paidBuyAmount;
  const topAlert=d.alerts[0]||null;
  const nextAction=topAlert
  ? {
    title:topAlert.title,
    detail:topAlert.detail,
    tab:topAlert.tab,
    critical:topAlert.badge==='bno'
  }
  : {
    title:'Aucune urgence bloquante',
    detail:'Les données chargées ne montrent pas d’anomalie prioritaire. Tu peux te concentrer sur le suivi courant.',
    tab:hasPerm('perm_adherents')?'adherents':hasPerm('perm_comptabilite')?'comptabilite':hasPerm('perm_banque')?'banque':'',
    critical:false
  };
  const entryDelta=dashboardDelta(d.monthEntriesList.length,d.prevMonthEntriesList.length);
  const invoiceDelta=dashboardDelta(d.monthInvoiceAmount,d.prevMonthInvoiceAmount,'€');
  const buyDelta=dashboardDelta(d.monthBuyAmount,d.prevMonthBuyAmount,'€');
  const dashM=UI.dashPeriod==='3m'?3:UI.dashPeriod==='12m'?12:6;
  const invoiceSeries=buildMonthSeries(sumByMonth(d.factures,'date_op',f=>(f.lignes||[]).reduce((sum,l)=>sum+(+l.qte||0)*(+l.pu||0),0)),dashM);
  const buySeries=buildMonthSeries(sumByMonth(d.achats,'date_op',a=>+a.montant||0),dashM);
  const entrySeries=buildMonthSeries(countByMonth(d.journal,'date_op'),dashM);
  const docsComplete=d.adherents.length-d.incompleteList.length;
  const reconciled=d.bankTransactions.length-d.unreconciledTransactions.length;
  const recentFeed=[
    ...(hasPerm('perm_facturation')?d.recentInvoices.map(f=>({title:`Vente ${f.numero||'sans numéro'}`,detail:`${fd(f.date_op)} · ${f.destinataire||'Destinataire non renseigné'} · ${euro((f.lignes||[]).reduce((sum,l)=>sum+(+l.qte||0)*(+l.pu||0),0))}`,tab:'facture',badge:'bblue',badgeText:f.statut||'Vente'})):[]),
    ...(hasPerm('perm_achats')?d.recentBuys.map(a=>({title:`Achat ${a.fournisseur||'sans fournisseur'}`,detail:`${fd(a.date_op)} · ${a.designation||a.categorie||'Sans désignation'} · ${euro(+a.montant||0)}`,tab:'achat',badge:'bgray',badgeText:a.statut||'Achat'})):[]),
    ...(hasPerm('perm_banque')?d.recentTransactions.map(t=>({title:`Banque ${t.compte_nom||'Compte'}`,detail:`${fd(t.date_op)} · ${t.libelle||'Opération'} · ${euro((+t.credit||0)-(+t.debit||0))}`,tab:'banque',badge:t.rapproche?'bok':'bwarn',badgeText:t.rapproche?'Rapprochée':'À rapprocher'})):[]),
  ].sort((a,b)=>{
    // Tri par date décroissante extraite du champ detail (format dd/mm/yyyy)
    const dateRe=/(\d{2})\/(\d{2})\/(\d{4})/;
    const da=(a.detail||'').match(dateRe);
    const db=(b.detail||'').match(dateRe);
    if(da&&db){
      const ia=`${da[3]}-${da[2]}-${da[1]}`;
      const ib=`${db[3]}-${db[2]}-${db[1]}`;
      return ib.localeCompare(ia);
    }
    return da?-1:db?1:0;
  }).slice(0,8);
  const managementBlocks=[
    hasPerm('perm_adherents')?{
      title:'Adhérents',
      lines:[
        `${d.adherents.length} fiche(s) suivie(s)`,
        `${d.currentSeasonAdherents.length} sur la saison ${d.currentSeason}`,
        `${d.incompleteList.length} dossier(s) incomplet(s)`,
      ],
      cta:'Voir les adhérents',
      tab:'adherents'
    }:null,
    hasPerm('perm_banque')?{
      title:'Banque',
      lines:[
        `${d.comptes.length} compte(s) visibles`,
        `${d.bankTransactions.length} transaction(s) importée(s)`,
        `${d.unreconciledTransactions.length} non rapprochée(s)`,
      ],
      cta:'Ouvrir la banque',
      tab:'banque'
    }:null,
    hasPerm('perm_comptabilite')?{
      title:'Comptabilité',
      lines:[
        `${d.exoJournal.length} écriture(s) sur l’exercice actif`,
        `${d.monthEntriesList.length} mouvement(s) ce mois`,
        `Écart exercice : ${euro(d.accountingGap)}`,
      ],
      cta:'Ouvrir la compta',
      tab:'comptabilite'
    }:null,
    hasPerm('perm_achats')?{
      title:'Achats',
      lines:[
        `${d.achats.length} achat(s) suivis`,
        `${d.purchasesPending.length} en attente`,
        `Montant en cours : ${euro(d.pendingBuyAmount)}`,
      ],
      cta:'Voir les achats',
      tab:'achat'
    }:null,
    hasPerm('perm_facturation')?{
      title:'Ventes',
      lines:[
        `${d.factures.length} document(s) émis`,
        `${d.invoicesOpen.length} facture(s) ouverte(s)`,
        `Encours : ${euro(d.openInvoiceAmount)}`,
      ],
      cta:'Voir les ventes',
      tab:'facture'
    }:null
  ].filter(Boolean);
  return `<div class="view-head">
  <div>
  <div class="eyebrow">Vue d'ensemble</div>
  <h2>Pilotage</h2>
  <p>Tout le club, en un écran.</p>
  </div>
  <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
  <div class="exo-badge">Exercice actif : ${esc(D.currentExo?.libelle||'Aucun')}</div>
  <div style="display:flex;gap:4px">
  <button class="btn sm ${UI.dashPeriod==='3m'?'primary':''}" onclick="UI.dashPeriod='3m';render()">3 mois</button>
  <button class="btn sm ${UI.dashPeriod==='6m'||!UI.dashPeriod?'primary':''}" onclick="UI.dashPeriod='6m';render()">6 mois</button>
  <button class="btn sm ${UI.dashPeriod==='12m'?'primary':''}" onclick="UI.dashPeriod='12m';render()">12 mois</button>
  </div>
  </div>
  </div>
  <div class="dash-hero">
  <div class="dash-hero-main">
  <div class="dash-hero-kicker">Vision transversale</div>
  <div class="dash-hero-title">${esc(urgentLabel)}</div>
  <div class="dash-hero-text">Adhérents, banque, compta, achats et ventes. Priorités visibles immédiatement.</div>
  <div class="dash-hero-meta">
  <span class="dash-hero-chip">Exercice : ${esc(D.currentExo?.libelle||'Aucun')}</span>
  <span class="dash-hero-chip">Profil : ${esc(ROLES[UI.currentUser?.role]||UI.currentUser?.role||'Utilisateur')}</span>
  <span class="dash-hero-chip">Saison visible : ${esc(d.currentSeason||'—')}</span>
  </div>
  </div>
  <div class="dash-hero-side">
  <div class="dash-mini">
  <div class="dash-mini-label">Dossiers</div>
  <div class="dash-mini-value">${hasPerm('perm_adherents')?d.incompleteList.length:'—'}</div>
  <div class="dash-mini-text">${hasPerm('perm_adherents')?`${d.renewList.length} à renouveler · ${d.adherentsExpired.length} expirés`:'Rubrique non accessible.'}</div>
  </div>
  <div class="dash-mini">
  <div class="dash-mini-label">Flux net</div>
  <div class="dash-mini-value">${hasPerm('perm_facturation')||hasPerm('perm_achats')?euro(financeBalance):'—'}</div>
  <div class="dash-mini-text">${hasPerm('perm_facturation')||hasPerm('perm_achats')?`${euro(d.paidInvoiceAmount)} encaissés · ${euro(d.paidBuyAmount)} dépensés`:'Rubrique non accessible.'}</div>
  </div>
  </div>
  </div>
  <div class="dash-priority" style="margin-bottom:16px">
  <div class="dash-priority-card ${nextAction.critical?'critical':''}">
  <div class="dash-priority-head">
  <div>
  <div class="eyebrow" style="margin-bottom:8px">À faire maintenant</div>
  <div class="dash-priority-title">${esc(nextAction.title)}</div>
  </div>
  <span class="badge ${nextAction.critical?'bno':'bok'}">${nextAction.critical?'Priorité haute':'Situation stable'}</span>
  </div>
  <div class="dash-priority-text">${esc(nextAction.detail)}</div>
  <div class="dash-priority-actions">
  ${nextAction.tab?`<button class="btn primary" onclick="showTab('${nextAction.tab}')">Traiter maintenant</button>`:''}
  ${hasPerm('perm_comptabilite')?`<button class="btn" onclick="showTab('comptabilite')">Vérifier la compta</button>`:''}
  ${hasPerm('perm_banque')?`<button class="btn" onclick="showTab('banque')">Contrôler la banque</button>`:''}
  </div>
  </div>
  </div>
  <div class="dash-grid">
  <div class="dash-card" style="cursor:pointer" onclick="showTab('adherents')" title="Voir les adhérents"><h3>Adhérents</h3><strong>${hasPerm('perm_adherents')?d.adherents.length:'—'}</strong><p>${hasPerm('perm_adherents')?`${d.adherentsSoon.length} échéances proches`:'Rubrique non accessible.'}</p></div>
  <div class="dash-card" style="cursor:pointer" onclick="showTab('banque')" title="Ouvrir la banque"><h3>Trésorerie</h3><strong>${hasPerm('perm_banque')?euro(d.totalBank):'—'}</strong><p>${hasPerm('perm_banque')?`${d.unreconciledTransactions.length} non rapprochées`:'Rubrique non accessible.'}</p></div>
  <div class="dash-card" style="cursor:pointer" onclick="showTab('comptabilite')" title="Ouvrir la comptabilité"><h3>Compta</h3><strong>${hasPerm('perm_comptabilite')?d.monthEntriesList.length:'—'}</strong><p>${hasPerm('perm_comptabilite')?`Écart ${euro(d.accountingGap)}`:'Rubrique non accessible.'}</p></div>
  <div class="dash-card" style="cursor:pointer" onclick="showTab('facture')" title="Voir les ventes"><h3>Ventes</h3><strong>${hasPerm('perm_facturation')?d.invoicesOpen.length:'—'}</strong><p>${hasPerm('perm_facturation')?`${euro(d.openInvoiceAmount)} à encaisser`:'Rubrique non accessible.'}</p></div>
  </div>
  <div class="dash-viz-grid">
  <div class="dash-viz-card">
  <div class="dash-viz-title">Ventes 6 mois</div>
  <div class="dash-viz-value">${hasPerm('perm_facturation')?euro(d.monthInvoiceAmount):'—'}</div>
  <div class="dash-viz-sub">${hasPerm('perm_facturation')?'Ce mois':'Rubrique non accessible.'}</div>
  ${hasPerm('perm_facturation')?`<div class="dash-chart">${renderBarChart(invoiceSeries,'#B33627')}<div class="dash-chart-legend"><span>${esc(invoiceSeries[0]?.label||'')}</span><span>${esc(invoiceSeries.at(-1)?.label||'')}</span></div></div>`:''}
  </div>
  <div class="dash-viz-card">
  <div class="dash-viz-title">Achats 6 mois</div>
  <div class="dash-viz-value">${hasPerm('perm_achats')?euro(d.monthBuyAmount):'—'}</div>
  <div class="dash-viz-sub">${hasPerm('perm_achats')?'Ce mois':'Rubrique non accessible.'}</div>
  ${hasPerm('perm_achats')?`<div class="dash-chart">${renderLineChart(buySeries,'#8E6A0C')}<div class="dash-chart-legend"><span>${esc(buySeries[0]?.label||'')}</span><span>${esc(buySeries.at(-1)?.label||'')}</span></div></div>`:''}
  </div>
  <div class="dash-viz-card">
  <div class="dash-viz-title">Qualité des données</div>
  <div class="dash-viz-value">${hasPerm('perm_adherents')?`${docsComplete}/${d.adherents.length||0}`:'—'}</div>
  <div class="dash-viz-sub">${hasPerm('perm_adherents')?'Dossiers complets':'Rubrique non accessible.'}</div>
  ${hasPerm('perm_adherents')?`<div class="dash-chart">${renderGauge(docsComplete,d.adherents.length||1,'#1e7e34')}</div>`:''}
  </div>
  </div>
  <div class="card" style="margin-bottom:16px">
  <div class="stit" style="margin-top:0">Tendances mensuelles</div>
  <div class="dash-compare">
  <div class="dash-compare-card">
  <div class="dash-compare-label">Écritures comptables</div>
  <div class="dash-compare-value">${hasPerm('perm_comptabilite')?d.monthEntriesList.length:'—'}</div>
  <div class="dash-compare-delta ${entryDelta.cls}">${hasPerm('perm_comptabilite')?entryDelta.label:'Rubrique non accessible.'}</div>
  </div>
  <div class="dash-compare-card">
  <div class="dash-compare-label">Ventes du mois</div>
  <div class="dash-compare-value">${hasPerm('perm_facturation')?euro(d.monthInvoiceAmount):'—'}</div>
  <div class="dash-compare-delta ${invoiceDelta.cls}">${hasPerm('perm_facturation')?invoiceDelta.label:'Rubrique non accessible.'}</div>
  </div>
  <div class="dash-compare-card">
  <div class="dash-compare-label">Achats du mois</div>
  <div class="dash-compare-value">${hasPerm('perm_achats')?euro(d.monthBuyAmount):'—'}</div>
  <div class="dash-compare-delta ${buyDelta.cls}">${hasPerm('perm_achats')?buyDelta.label:'Rubrique non accessible.'}</div>
  </div>
  </div>
  </div>
  <div class="dash-section-grid">
  <div class="card">
  <div class="stit" style="margin-top:0">Récapitulatif club</div>
  <div class="dash-stat-grid">
  <div class="dash-stat">
  <div class="dash-stat-label">Adhérents</div>
  <div class="dash-stat-value">${hasPerm('perm_adherents')?d.adherents.length:'—'}</div>
  <div class="dash-stat-sub">${hasPerm('perm_adherents')?`${d.renewList.length} à renouveler · ${d.incompleteList.length} incomplets`:'Rubrique non accessible.'}</div>
  </div>
  <div class="dash-stat">
  <div class="dash-stat-label">Banque</div>
  <div class="dash-stat-value">${hasPerm('perm_banque')?euro(d.totalBank):'—'}</div>
  <div class="dash-stat-sub">${hasPerm('perm_banque')?`${d.bankTransactions.length} mouvements · ${d.unreconciledTransactions.length} à rapprocher`:'Rubrique non accessible.'}</div>
  </div>
  <div class="dash-stat">
  <div class="dash-stat-label">Achats</div>
  <div class="dash-stat-value">${hasPerm('perm_achats')?euro(d.pendingBuyAmount):'—'}</div>
  <div class="dash-stat-sub">${hasPerm('perm_achats')?`${d.purchasesPending.length} en attente · ${d.purchasesRefused.length} refusés`:'Rubrique non accessible.'}</div>
  </div>
  <div class="dash-stat">
  <div class="dash-stat-label">Ventes</div>
  <div class="dash-stat-value">${hasPerm('perm_facturation')?euro(d.openInvoiceAmount):'—'}</div>
  <div class="dash-stat-sub">${hasPerm('perm_facturation')?`${d.invoicesOpen.length} ouvertes · ${d.invoicesPaid.length} réglées`:'Rubrique non accessible.'}</div>
  </div>
  </div>
  </div>
  <div class="card">
  <div class="stit" style="margin-top:0">Accès rapides</div>
  <div class="dash-quick">
  ${hasPerm('perm_adherents','write')?`<button class="btn primary" onclick="openModal('adh')">+ Nouvel adhérent</button>`:''}
  ${hasPerm('perm_adherents')?`<button class="btn" onclick="showTab('adherents')">Voir les adhérents</button>`:''}
  ${hasPerm('perm_comptabilite')?`<button class="btn" onclick="showTab('comptabilite')">Ouvrir la compta</button>`:''}
  ${hasPerm('perm_facturation','write')?`<button class="btn gold" onclick="openNewFacture()">Créer une vente</button>`:''}
  ${hasPerm('perm_achats')?`<button class="btn" onclick="focusAchats('pending')">Suivre les achats</button>`:''}
  </div>
  <div style="margin-top:14px">
  <span class="dash-pill ${hasPerm('perm_adherents')&&d.incompleteList.length?'alert':'ok'}">Documents incomplets : ${hasPerm('perm_adherents')?d.incompleteList.length:'—'}</span>
  <span class="dash-pill ${hasPerm('perm_adherents')&&d.renewList.length?'alert':'ok'}">Renouvellements : ${hasPerm('perm_adherents')?d.renewList.length:'—'}</span>
  <span class="dash-pill ${hasPerm('perm_achats')&&d.purchasesPending.length?'alert':'ok'}">Achats à régler : ${hasPerm('perm_achats')?d.purchasesPending.length:'—'}</span>
  </div>
  </div>
  </div>
  <div class="dash-list">
  <div class="card">
  <div class="stit" style="margin-top:0">Points d'attention</div>
  ${renderDashboardFeed(attentionItems,'Aucune alerte bloquante détectée sur les données chargées.')}
  </div>
  <div class="card">
  <div class="stit" style="margin-top:0">Conseils d'optimisation</div>
  <div class="dash-item-main">
  ${optimizationTips.map(tip=>`<div class="dash-item"><div class="dash-item-main"><span class="dash-item-sub">${esc(tip)}</span></div><span class="badge bok">Conseil</span></div>`).join('')}
  </div>
  </div>
  </div>
  <div class="dash-list">
  <div class="card">
  <div class="stit" style="margin-top:0">Activité récente</div>
  ${renderDashboardFeed(recentFeed,'Aucune activité récente disponible sur les rubriques accessibles.','Suivi')}
  </div>
  <div class="card">
  <div class="stit" style="margin-top:0">Lecture par onglet</div>
  <div class="dash-split">
  ${managementBlocks.map(block=>`<div class="dash-stat">
    <div class="dash-stat-label">${esc(block.title)}</div>
    <div class="dash-item-main">
    ${block.lines.map(line=>`<span class="dash-item-sub">${esc(line)}</span>`).join('')}
    <a href="#" class="dash-link" onclick="showTab('${block.tab}');return false">${esc(block.cta)}</a>
    </div>
    </div>`).join('')}
    </div>
    </div>
    </div>
    `;
}

function renderDashboardFeed(items, emptyText, badgeLabel){
  return items.length
  ? items.map(item=>`<div class="dash-item">
  <div class="dash-item-main">
  <span class="dash-item-title">${esc(item.title)}</span>
  <span class="dash-item-sub">${esc(item.detail)}</span>
  ${item.advice?`<span class="dash-item-sub"><strong>Conseil:</strong> ${esc(item.advice)}</span>`:''}
  ${item.tab?`<a href="#" class="dash-link" onclick="showTab('${item.tab}');return false">Ouvrir ${esc((ALL_TABS.find(t=>t.id===item.tab)?.label||item.tab).toLowerCase())}</a>`:''}
  ${item.actions?.length?`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">${item.actions.map(action=>`<button class="btn sm ${action.primary?'primary':''}" onclick="${action.onclick}">${esc(action.label)}</button>`).join('')}</div>`:''}
  </div>
  <span class="badge ${item.badge||'bgray'}">${esc(item.badgeText||badgeLabel||'Suivi')}</span>
  </div>`).join('')
  : `<div class="dash-empty">${esc(emptyText)}</div>`;
}

function vAdh(){
  const canWrite=hasPerm('perm_adherents','write');
  const season=currentSeasonLabel();
  const filtered=D.adherents.filter(a=>{
    const txt=(a.nom+' '+a.prenom+' '+(a.ville||'')).toLowerCase();
    const matchesSearch=txt.includes((UI.search.adherents||'').toLowerCase());
    const matchesStatut=!UI.adhFilters.statut || a.statut===UI.adhFilters.statut;
    const matchesType=!UI.adhFilters.type || (a.discipline||'Club')===UI.adhFilters.type;
    const adhSeason=seasonFromDate(a.date_fin_adhesion||a.date_inscription);
    const matchesSeason=UI.adhFilters.season==='all' || !UI.adhFilters.season || adhSeason===season;
    const matchesSpecial=adherentMatchesSpecialFilter(a,UI.adhFilters.special);
    return matchesSearch&&matchesStatut&&matchesType&&matchesSeason&&matchesSpecial;
  }).sort((a,b)=>compareAlpha(a.nom,b.nom) || compareAlpha(a.prenom,b.prenom));
  const {rows:f,totalPages}=paginateList(filtered,'adherents');
  const tot=filtered.reduce((s,a)=>s+(+a.cotisation||0)+(+a.montant_pass_region||0),0);
  const ok=filtered.filter(a=>a.droit_image&&a.certificat&&a.reglement).length;
  const exp=filtered.filter(a=>adhStatus(a)==='expire').length;
  const ren=filtered.filter(a=>a.statut==='Renouvellement').length;
  return`<div class="view-head">
  <div>
  <div class="eyebrow">Suivi sportif et administratif</div>
  <h2>Adhérents</h2>
  <p>Pilotez les dossiers, les cotisations et les pièces administratives depuis une vue unique, claire et rapide à parcourir.</p>
  </div>
  <div class="exo-badge">Saison en cours : ${season}</div>
  </div>
  <div class="g4" style="margin-bottom:14px">
  <div class="sc"><div class="v vr">${filtered.length}</div><div class="l">Adhérents</div></div>
  <div class="sc"><div class="v vgo">${tot.toLocaleString('fr-FR',{minimumFractionDigits:2})} €</div><div class="l">Total cotisations</div></div>
  <div class="sc"><div class="v vg">${ok}</div><div class="l">Dossiers complets</div></div>
  <div class="sc"><div class="v ${ren>0?'vgo':''}">${ren}</div><div class="l">À renouveler</div></div>
  </div>
  <div class="g2" style="margin-bottom:14px">
  <div class="card" style="padding:12px 16px"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:12px"><span>Annulées : <strong>${filtered.filter(a=>a.statut==='Adhésion annulée').length}</strong></span><span>Inactives : <strong>${filtered.filter(a=>a.statut==='Inactif').length}</strong></span><span>Expirées : <strong>${exp}</strong></span></div></div>
  <div class="card" style="padding:12px 16px"><div style="font-size:12px;color:var(--txt2)">Tri courant</div><div style="margin-top:4px;font-weight:600">Classement alphabétique par nom puis prénom</div></div>
  </div>
  <div class="toolbar">
  <input style="flex:1;min-width:160px" placeholder="Rechercher..." value="${UI.search.adherents||''}" oninput="UI.search.adherents=this.value;render()">
  <select style="width:auto;min-width:160px" onchange="UI.adhFilters.type=this.value;render()">
  <option value="" ${!UI.adhFilters.type?'selected':''}>Tous les types</option>
  ${ADH_TYPES.map(t=>`<option value="${t}" ${UI.adhFilters.type===t?'selected':''}>${t}</option>`).join('')}
  </select>
  <select style="width:auto;min-width:170px" onchange="UI.adhFilters.statut=this.value;render()">
  <option value="" ${!UI.adhFilters.statut?'selected':''}>Tous les statuts</option>
  ${ADH_STATUTS.map(s=>`<option value="${s}" ${UI.adhFilters.statut===s?'selected':''}>${s}</option>`).join('')}
  </select>
  <select style="width:auto;min-width:170px" onchange="UI.adhFilters.season=this.value;render()">
  <option value="current" ${UI.adhFilters.season==='current'?'selected':''}>Saison en cours</option>
  <option value="all" ${UI.adhFilters.season==='all'?'selected':''}>Toutes les saisons</option>
  </select>
  <select style="width:auto;min-width:180px" onchange="UI.adhFilters.special=this.value;render()">
  <option value="" ${!UI.adhFilters.special?'selected':''}>Tous les dossiers</option>
  <option value="incomplete" ${UI.adhFilters.special==='incomplete'?'selected':''}>Dossiers incomplets</option>
  <option value="renew" ${UI.adhFilters.special==='renew'?'selected':''}>À renouveler</option>
  <option value="expired" ${UI.adhFilters.special==='expired'?'selected':''}>Expirés</option>
  <option value="soon" ${UI.adhFilters.special==='soon'?'selected':''}>Échéance proche</option>
  </select>
  ${canWrite?`<button class="btn primary" onclick="openModal('adh')">+ Nouvel adhérent</button>`:''}
  ${canWrite?`<button class="btn gold" onclick="openDiplomeForAdherent()">🎓 Nouveau diplôme</button>`:''}
  <button class="btn" onclick="exportCSV()">⬇ Export CSV</button>
  <button class="btn" onclick="exportAdhEmailsCSV()" title="Exporter les emails des adhérents filtrés pour envoi groupé">📧 Export emails</button>
  <button class="btn" onclick="showTab('administration');showST('admin','imp_adh')">Import DoliAsso</button>
  <button class="btn" onclick="UI.search.adherents='';UI.adhFilters={statut:'',type:'',season:'current',special:''};render()">Réinitialiser</button>
  </div>
  ${canWrite && Object.keys(UI.adhSelected).some(id=>UI.adhSelected[id])?`<div class="toolbar" style="background:var(--gold-l,#fff8e1);border-color:var(--gold,#c9a000)">
  <strong>${Object.values(UI.adhSelected).filter(Boolean).length} sélectionné(s)</strong>
  <button class="btn gold" onclick="bulkRenewSelectedAdh()">↻ Renouveler la sélection</button>
  <button class="btn" onclick="clearAdhSelection()">Désélectionner tout</button>
  </div>`:''}
  <div class="wrap"><table>
  <thead><tr>${canWrite?`<th style="width:32px"><input type="checkbox" style="width:auto" onchange='toggleAdhSelectAllVisible(${JSON.stringify(f.map(a=>a.id))})' ${f.length&&f.every(a=>UI.adhSelected[a.id])?'checked':''}></th>`:''}${thSort('Nom / Prénom','nom')}${thSort('Type','discipline')}${thSort('Certif.','certificat')}${thSort('Droit img','droit_image')}${thSort('Pass Région','pass_region')}<th>Règlement</th>${thSort('Cotisation','cotisation')}${thSort('Paiement','paiement')}${thSort('Statut','statut')}<th>Saison</th>${thSort('Fin adhésion','date_fin_adhesion')}<th>PDF</th><th></th></tr></thead>
  <tbody>${f.map(a=>{
    const docs=getAdherentDocuments(a.id);
    return `<tr class="${adhStatus(a)==='expire'?'adh-expire':adhStatus(a)==='soon'?'adh-soon':'adh-valid'}">
    ${canWrite?`<td><input type="checkbox" style="width:auto" ${UI.adhSelected[a.id]?'checked':''} onchange="toggleAdhSelect('${a.id}')"></td>`:''}
    <td><strong style="font-weight:500">${a.nom} ${a.prenom}</strong>${a.ville?`<br><span style="font-size:10px;color:var(--txt2)">${a.ville}</span>`:''}</td>
    <td><span class="badge bgray">${a.discipline||'Club'}</span></td>
    <td>${bdg(a.certificat)}</td><td>${bdg(a.droit_image)}</td>
    <td>${bdg(a.pass_region)}${+a.montant_pass_region>0?` <span style="font-size:11px;color:var(--gold-d)">+${(+a.montant_pass_region).toFixed(0)}€</span>`:''}</td>
    <td>${bdg(a.reglement)}</td>
    <td><strong style="font-weight:500">${(+a.cotisation).toFixed(2)} €</strong>${+a.montant_pass_region>0?`<br><span style="font-size:10px;color:var(--txt2)">Pass: ${(+a.montant_pass_region).toFixed(2)}€</span>`:''}</td>
    <td style="font-size:11px">${a.paiement||''}</td>
    <td><span class="badge ${adhStatutBadge(a.statut)}">${a.statut||'—'}</span></td>
    <td>${seasonFromDate(a.date_fin_adhesion||a.date_inscription)||'—'}</td>
    <td>${adhBadge(a)}</td>
    <td style="white-space:nowrap">
    ${canWrite?`<button class="btn sm" onclick="trigPDF('adherents','${a.id}')">${a.pdf_public_url?'Remplacer':'Ajouter'}</button>`:''}
    ${a.pdf_public_url?`<a class="btn sm" style="margin-left:4px" href="${a.pdf_public_url}" target="_blank">Voir</a>`:`<span class="badge bgray" style="margin-left:4px">Aucun</span>`}
    ${docs.length?`<br><span style="font-size:10px;color:var(--txt2)">${docs.length} justificatif(s)</span>`:''}
    </td>
    <td style="white-space:nowrap">
    ${canWrite?`<button class="btn sm" onclick="openModal('adh','${a.id}')">Modifier</button>
    <button class="btn sm" style="margin-left:4px;background:var(--gold-l,#fff8e1);color:var(--gold-d,#7a5c00);border-color:var(--gold,#c9a000)" onclick="renewAdh('${a.id}')" title="Renouveler l'adhésion pour la saison suivante">↻</button>
    <button class="btn sm danger" style="margin-left:4px" onclick="delAdh('${a.id}')">✕</button>
    <button class="btn sm" style="margin-left:4px" onclick="openDiplomeForAdherent('${a.id}')">Diplôme</button>
    <button class="btn sm gold" style="margin-left:4px" onclick="genRecu('${a.id}')">Reçu</button>`:''}
    </td>
    </tr>`;
  }).join('')}
  ${f.length===0?`<tr><td colspan="${canWrite?14:13}" class="empty">Aucun adhérent</td></tr>`:''}
  </tbody>
  </table></div>
  ${renderPager('adherents',totalPages)}`;
}

function trigPDF(type,id){
  const perm=type==='adherents'?'perm_adherents':type==='achats'?'perm_achats':'';
  if(perm && !requireWritePerm(perm)) return;
  UI.pdfTarget={type,id};document.getElementById('pdf-input').click()
}
async function attachPDF(e){
  const file=e.target.files[0];
  const target=UI.pdfTarget;
  e.target.value='';
  UI.pdfTarget=null;
  if(!file||!target?.id||!target?.type)return;
  if(!SB?.storage)return alert(`${storageProviderLabel()} indisponible.`);
  const safeName=(file.name||'document.pdf').replace(/[^a-zA-Z0-9._-]+/g,'_');
  const path=`${target.type}/${target.id}/${Date.now()}_${safeName}`;
  const {error:upErr}=await SB.storage.from('fullfighting-pdf').upload(path,file,{upsert:false,contentType:'application/pdf'});
  if(upErr)return alert('Upload PDF impossible : '+upErr.message);
  const {data:pub}=SB.storage.from('fullfighting-pdf').getPublicUrl(path);
  const patch={pdf_storage_path:path,pdf_public_url:pub?.publicUrl||null,pdf_nom_fichier:file.name,pdf_uploaded_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  const cfg=target.type==='adherents'
  ? {table:'adherents',rows:D.adherents,label:'fiche adhérent'}
  : target.type==='achats'
  ? {table:'achats',rows:D.achats,label:'achat'}
  : null;
  if(!cfg) return alert('Type de document non supporté.');
  const row=cfg.rows.find(x=>x.id===target.id);
  if(!row) return alert(cfg.label==='achat'?'Achat introuvable.':'Adhérent introuvable.');
  const {error}=await SB.from(cfg.table).update(patch).eq('id',target.id);
  if(error)return alert(`PDF téléversé, mais ${cfg.label} non mise à jour : `+error.message);
  Object.assign(row,patch);
  render();
  alert(`PDF ${cfg.label} enregistré dans ${storageProviderLabel()}.`);
}
function toggleAdhSelect(id){
  if(UI.adhSelected[id]) delete UI.adhSelected[id];
  else UI.adhSelected[id]=true;
  render();
}
function toggleAdhSelectAllVisible(ids){
  const allSelected=ids.length>0 && ids.every(id=>UI.adhSelected[id]);
  if(allSelected) ids.forEach(id=>delete UI.adhSelected[id]);
  else ids.forEach(id=>UI.adhSelected[id]=true);
  render();
}
function clearAdhSelection(){ UI.adhSelected={}; render(); }

async function bulkRenewSelectedAdh(){
  if(!requireWritePerm('perm_adherents')) return;
  const ids=Object.keys(UI.adhSelected).filter(id=>UI.adhSelected[id]);
  const adhs=ids.map(id=>D.adherents.find(a=>a.id===id)).filter(Boolean);
  if(!adhs.length) return;
  if(!confirm(`Renouveler l'adhésion de ${adhs.length} adhérent(s) sélectionné(s) ?\n\nPour chacun : nouvelle date de fin = +1 an, statut remis à "Actif", Certificat et Règlement décochés (à re-valider individuellement).`)) return;
  let okCount=0, errCount=0;
  for(const adh of adhs){
    const currentFin=adh.date_fin_adhesion||td();
    const [y,m,d2]=currentFin.split('-').map(Number);
    const newFin=`${(y||new Date().getFullYear())+1}-${String(m||8).padStart(2,'0')}-${String(d2||31).padStart(2,'0')}`;
    const patch={
      statut:'Actif',
      date_fin_adhesion:newFin,
      certificat:0,
      reglement:0,
      updated_at:new Date().toISOString(),
      notes:(adh.notes?adh.notes+'\n':'')+`[Renouvelé en lot le ${td()} — fin : ${newFin}]`
    };
    const {error}=await SB.from('adherents').update(patch).eq('id',adh.id);
    if(error){ errCount++; continue; }
    Object.assign(adh,patch);
    okCount++;
  }
  UI.adhSelected={};
  if(errCount) notify('warn',`${okCount} renouvelé(s), ${errCount} échec(s).`,'Adhérents');
  else notify('success',`${okCount} adhésion(s) renouvelée(s).`,'Adhérents');
  render();
}

async function renewAdh(id){
  if(!requireWritePerm('perm_adherents')) return;
  const adh=D.adherents.find(a=>a.id===id);
  if(!adh) return;
  const nomComplet=`${adh.prenom} ${adh.nom}`.trim();
  // Calculer la nouvelle date de fin : +1 an par rapport à la date de fin actuelle
  // ou +1 an à partir d'aujourd'hui si pas de date de fin
  const currentFin=adh.date_fin_adhesion||td();
  const [y,m,d2]=currentFin.split('-').map(Number);
  const newFin=`${(y||new Date().getFullYear())+1}-${String(m||8).padStart(2,'0')}-${String(d2||31).padStart(2,'0')}`;
  if(!confirm(`Renouveler l'adhésion de ${nomComplet} ?\n\nNouvelle date de fin : ${fd(newFin)}\nLe statut sera remis à "Actif".\nLes cases Certificat et Règlement seront décochées (à re-valider).`)) return;
  const patch={
    statut:'Actif',
    date_fin_adhesion:newFin,
    certificat:0,
    reglement:0,
    updated_at:new Date().toISOString(),
    notes:(adh.notes?adh.notes+'\n':'')+`[Renouvelé le ${td()} — fin : ${newFin}]`
  };
  const {error}=await SB.from('adherents').update(patch).eq('id',id);
  if(error) return notify('error','Erreur renouvellement : '+error.message,'Adhérent');
  Object.assign(adh,patch);
  notify('success',`Adhésion de ${nomComplet} renouvelée jusqu'au ${fd(newFin)}.`,'Adhérent');
  render();
}

async function delAdh(id){
  if(!requireWritePerm('perm_adherents')) return;
  const adh=D.adherents.find(a=>a.id===id);
  const nomComplet=adh?`${adh.nom} ${adh.prenom}`:'cet adhérent';
  if(!confirm(`Archiver ${nomComplet} ?\n\nL'adhérent sera retiré de la liste active mais son historique comptable sera conservé.\nPour une suppression définitive, contactez l'administrateur.`))return;
  const {error}=await SB.from('adherents').update({statut:'Inactif',notes:(adh?.notes?adh.notes+'\n':'')+'[Archivé le '+td()+']',updated_at:new Date().toISOString()}).eq('id',id);
  if(error)return alert('Erreur : '+error.message);
  if(adh){adh.statut='Inactif';}
  notify('success',`${nomComplet} archivé.`,'Adhérent');
  render();
}

// ═══════════════════════════════════════════════════
// DIPLÔMES
// ═══════════════════════════════════════════════════
function openDiplomeForAdherent(id){
  const list=sortAdherentsList([...D.adherents]);
  const adh=(id && D.adherents.find(a=>a.id===id)) || D.adherents.find(a=>a.id===UI.diplome.adherentId) || list[0] || null;
  if(!adh){
    alert('Aucun adhérent disponible pour générer un diplôme.');
    return;
  }
  UI.diplome.adherentId=adh.id;
  UI.diplome.date=UI.diplome.date||td();
  UI.diplome.templatePath=guessDiplomeTemplateForAdherent(adh);
  UI.tab='diplomes';
  renderTabs();
  render();
}

function selectedDiplomeAdherent(){
  return D.adherents.find(a=>a.id===UI.diplome.adherentId) || null;
}

function diplomeFieldAnchorTransform(align){
  if(align==='right') return 'translate(-100%,-50%)';
  if(align==='center') return 'translate(-50%,-50%)';
  return 'translate(0,-50%)';
}

function diplomeTextStyle(field,interactive){
  return [
    'position:absolute',
    `left:${field.left}%`,
    `top:${field.top}%`,
    `width:${field.width}%`,
    `font-size:${field.fontSize}px`,
    `text-align:${field.align||'center'}`,
    `font-family:${field.fontFamily}`,
    `font-weight:${field.fontWeight||'400'}`,
    `font-style:${field.fontStyle||'normal'}`,
    'line-height:1',
    `color:${field.color||'#16110d'}`,
    `letter-spacing:${field.letterSpacing||0}px`,
    `transform:${diplomeFieldAnchorTransform(field.align)}`,
    interactive?'white-space:nowrap':'',
    '-webkit-text-stroke:.25px rgba(255,255,255,.35)',
    'text-shadow:0 1px 0 rgba(255,255,255,.92),0 0 3px rgba(255,255,255,.45),0 1px 2px rgba(0,0,0,.08)'
  ].join(';');
}

function diplomeImageBoxStyle(field){
  return [
    'position:absolute',
    `left:${field.left}%`,
    `top:${field.top}%`,
    `width:${field.width}%`,
    `height:${field.height}%`,
    `transform:${diplomeFieldAnchorTransform(field.align)}`,
    'display:flex',
    'align-items:center',
    'justify-content:center'
  ].join(';');
}

function buildDiplomeFieldValues(data){
  const nom=(data.nom||'').trim();
  const prenom=(data.prenom||'').trim();
  return {
    nomComplet:data.nomComplet||`${nom} ${prenom}`.trim(),
    prenom,
    nom,
    licence:data.licence||'Non renseigné',
    date:fd(data.date)
  };
}

function buildDiplomeImageValues(data){
  return {
    logo:data.logoUrl||D.logoUrl||FORCED_LOGO_URL||'',
    signature:data.signatureUrl||D.clubInfo?.[DIPLOME_SIGNATURE_KEY]||''
  };
}

function buildDiplomeTextOverlay(data){
  const layout=data.layout||normalizeDiplomeTemplateLayout();
  const textValues=buildDiplomeFieldValues(data);
  const imageValues=buildDiplomeImageValues(data);
  return Object.entries(layout.fields)
  .filter(([,field])=>field?.enabled)
  .map(([key,field])=>{
    const meta=diplomeFieldMeta(key);
    const label=meta.label;
    const active=UI.diplome.selectedField===key;
    if(meta.type==='image'){
      const src=imageValues[key]||'';
      const inner=src
      ? `<img class="dipl-field-proxy" src="${esc(src)}" alt="${esc(label)}" style="width:100%;height:100%;object-fit:${field.objectFit||'contain'};display:block">`
      : `<span class="dipl-field-proxy">${esc(label)}</span>`;
      return `<div class="dipl-field-box ${active?'active':''}" style="${diplomeImageBoxStyle(field)}" onmousedown="startDiplomeFieldDrag(event,'${key}')" onclick="selectDiplomeField('${key}')"><span class="dipl-field-tag">${esc(label)}</span>${inner}</div>`;
    }
    const style=diplomeTextStyle(field,data.mode==='editor');
    const value=esc(textValues[key]||'');
    if(data.mode==='editor'){
      return `<div class="dipl-field-box ${active?'active':''}" style="${style}" onmousedown="startDiplomeFieldDrag(event,'${key}')" onclick="selectDiplomeField('${key}')"><span class="dipl-field-tag">${esc(label)}</span><span class="dipl-field-proxy">${value||'—'}</span></div>`;
    }
    return `<div style="${style}">${value}</div>`;
  }).join('');
}

function buildDiplomeHTML(data,mode){
  const overlay=buildDiplomeTextOverlay({...data,mode:mode==='preview'?'editor':mode});
  if(mode==='print'){
    const bgLayer=data.templateUrl
    ? `<img src="${data.templateUrl}" alt="Modèle de diplôme" crossorigin="anonymous" referrerpolicy="no-referrer">`
    : `<div style="position:absolute;inset:0;background:linear-gradient(135deg,#fcf5e5,#f1e0b8)"></div>`;
    return `<div style="width:1123px;height:794px;position:relative;font-family:'Avenir Next','Segoe UI',sans-serif;color:#241009;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact">
    ${bgLayer}
    ${overlay}
    </div>`;
  }
  return `<div class="dipl-preview is-editor" id="diplome-preview-surface">
  <img class="dipl-preview-canvas" id="diplome-preview-image" alt="Aperçu du diplôme">
  ${overlay}
  </div>`;
}

let jsPdfPromise=null;
let diplomePreviewToken=0;
const diplomeImageDataUrlCache=new Map();

function loadScriptSequential(urls,check){
  return new Promise((resolve,reject)=>{
    let idx=0;
    const tryNext=()=>{
      if(check()) return resolve(check());
      if(idx>=urls.length) return reject(new Error('Impossible de charger la bibliothèque PDF.'));
      const script=document.createElement('script');
      script.src=urls[idx++];
      script.async=true;
      script.onload=()=>check()?resolve(check()):tryNext();
      script.onerror=tryNext;
      document.head.appendChild(script);
    };
    tryNext();
  });
}

function ensureJsPDF(){
  if(window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if(jsPdfPromise) return jsPdfPromise;
  jsPdfPromise=loadScriptSequential([
    '/vendor/jspdf/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js'
  ],()=>window.jspdf?.jsPDF);
  return jsPdfPromise;
}

function blobToDataURL(blob){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(new Error('Lecture du fichier image impossible.'));
    reader.readAsDataURL(blob);
  });
}

async function fetchImageDataURL(url){
  if(!url) return null;
  if(diplomeImageDataUrlCache.has(url)) return diplomeImageDataUrlCache.get(url);
  const res=await fetch(url,{mode:'cors',cache:'no-store'});
  if(!res.ok) throw new Error(`Image du diplôme inaccessible (${res.status}).`);
  const dataUrl=await blobToDataURL(await res.blob());
  diplomeImageDataUrlCache.set(url,dataUrl);
  return dataUrl;
}

function loadImageElement(src){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error('Chargement du modèle de diplôme impossible.'));
    img.src=src;
  });
}

async function buildDiplomeCanvas(data){
  const width=DIPLOME_PAGE.canvasWidth;
  const height=DIPLOME_PAGE.canvasHeight;
  const scale=1;
  const canvas=document.createElement('canvas');
  canvas.width=width*scale;
  canvas.height=height*scale;
  const ctx=canvas.getContext('2d');
  ctx.scale(scale,scale);

  ctx.fillStyle='#f7efdf';
  ctx.fillRect(0,0,width,height);

  if(data.templateUrl){
    const imageDataUrl=await fetchImageDataURL(data.templateUrl);
    const img=await loadImageElement(imageDataUrl);
    ctx.drawImage(img,0,0,width,height);
  }else{
    const g=ctx.createLinearGradient(0,0,width,height);
    g.addColorStop(0,'#fcf5e5');
    g.addColorStop(1,'#f1e0b8');
    ctx.fillStyle=g;
    ctx.fillRect(0,0,width,height);
  }

  const fields=data.layout?.fields||normalizeDiplomeTemplateLayout().fields;
  const imageValues=buildDiplomeImageValues(data);
  const fontsToLoad=[...new Set(Object.values(fields).map(field=>field.fontFamily).filter(Boolean))];
  if(document.fonts?.load){
    for(const family of fontsToLoad){
      try{ await document.fonts.load(`48px ${family}`); }catch(e){}
    }
  }

  const imageSources=[...new Set(Object.entries(fields)
  .filter(([key,field])=>field?.enabled && field.type==='image' && imageValues[key])
  .map(([key])=>imageValues[key]))];
  const loadedImages={};
  for(const src of imageSources){
    try{
      const imageDataUrl=await fetchImageDataURL(src);
      loadedImages[src]=await loadImageElement(imageDataUrl);
    }catch(e){}
  }

  const drawText=(text,field)=>{
    if(!field?.enabled || !text) return;
    ctx.save();
    ctx.font=`${field.fontStyle||'normal'} ${field.fontWeight||'400'} ${field.fontSize}px ${field.fontFamily}`;
    ctx.textAlign=field.align||'center';
    ctx.textBaseline='middle';
    ctx.fillStyle=field.color||'#16110d';
    ctx.strokeStyle='rgba(255,255,255,.35)';
    ctx.lineWidth=0.7;
    ctx.shadowColor='rgba(255,255,255,.55)';
    ctx.shadowBlur=3;
    ctx.shadowOffsetX=0;
    ctx.shadowOffsetY=1;
    const x=width*(field.left/100);
    const y=height*(field.top/100);
    const maxWidth=field.width ? width*(field.width/100) : undefined;
    const spacing=field.letterSpacing||0;
    if(!spacing){
      ctx.strokeText(text,x,y,maxWidth);
      ctx.fillText(text,x,y,maxWidth);
      ctx.restore();
      return;
    }
    ctx.textAlign='left';
    const chars=[...text];
    const metrics=chars.map(ch=>ctx.measureText(ch).width);
    const totalWidth=metrics.reduce((sum,w)=>sum+w,0) + spacing*Math.max(chars.length-1,0);
    let startX=x;
    if(field.align==='center') startX=x-totalWidth/2;
    if(field.align==='right') startX=x-totalWidth;
    chars.forEach((ch,idx)=>{
      const drawX=startX + metrics.slice(0,idx).reduce((sum,w)=>sum+w,0) + spacing*idx;
      ctx.strokeText(ch,drawX,y);
      ctx.fillText(ch,drawX,y);
    });
    ctx.restore();
  };

  const drawImageField=(key,field)=>{
    const src=imageValues[key];
    const img=src?loadedImages[src]:null;
    if(!field?.enabled || !img) return;
    const boxWidth=width*(field.width/100);
    const boxHeight=height*(field.height/100);
    let x=width*(field.left/100);
    if(field.align==='center') x-=boxWidth/2;
    if(field.align==='right') x-=boxWidth;
    const y=height*(field.top/100)-boxHeight/2;
    let drawW=boxWidth;
    let drawH=boxHeight;
    let drawX=x;
    let drawY=y;
    if((field.objectFit||'contain')!=='fill'){
      const boxRatio=boxWidth/boxHeight;
      const imgRatio=img.width/img.height;
      if(field.objectFit==='cover'){
        if(imgRatio>boxRatio){
          drawH=boxHeight;
          drawW=drawH*imgRatio;
          drawX=x-(drawW-boxWidth)/2;
        }else{
          drawW=boxWidth;
          drawH=drawW/imgRatio;
          drawY=y-(drawH-boxHeight)/2;
        }
      }else{
        if(imgRatio>boxRatio){
          drawW=boxWidth;
          drawH=drawW/imgRatio;
          drawY=y+(boxHeight-drawH)/2;
        }else{
          drawH=boxHeight;
          drawW=drawH*imgRatio;
          drawX=x+(boxWidth-drawW)/2;
        }
      }
    }
    ctx.drawImage(img,drawX,drawY,drawW,drawH);
  };

  const values=buildDiplomeFieldValues(data);
  Object.entries(fields).forEach(([key,field])=>{
    if(field.type==='image') drawImageField(key,field);
    else drawText(values[key]||'',field);
  });
    return canvas;
}

async function refreshDiplomePreviewCanvas(){
  const preview=document.getElementById('diplome-preview-image');
  if(!preview || UI.tab!=='diplomes') return;
  const adh=selectedDiplomeAdherent();
  const tpl=selectedDiplomeTemplate();
  if(!adh || !tpl){
    preview.removeAttribute('src');
    return;
  }
  const token=++diplomePreviewToken;
  preview.alt='Aperçu du diplôme en cours de génération';
  try{
    const canvas=await buildDiplomeCanvas({
      titre:UI.diplome.titre||'Diplôme de ceinture',
      nomComplet:`${adh.nom||''} ${adh.prenom||''}`.trim(),
                                          nom:adh.nom||'',
                                          prenom:adh.prenom||'',
                                          licence:adh.numero_licence||'Non renseigné',
                                          ceinture:adh.couleur_ceinture||'',
                                          date:UI.diplome.date||td(),
                                          templateUrl:tpl.url,
                                          logoUrl:D.logoUrl||FORCED_LOGO_URL,
                                          signatureUrl:D.clubInfo?.[DIPLOME_SIGNATURE_KEY]||'',
                                          layout:selectedDiplomeLayout()
    });
    if(token!==diplomePreviewToken) return;
    preview.src=canvas.toDataURL('image/png');
    preview.alt='Aperçu du diplôme';
  }catch(error){
    if(token!==diplomePreviewToken) return;
    preview.removeAttribute('src');
    preview.alt='Aperçu du diplôme indisponible';
    console.error('Aperçu diplôme impossible',error);
  }
}

async function printDiplome(){
  const adh=selectedDiplomeAdherent();
  const tpl=selectedDiplomeTemplate();
  if(!adh) return alert('Sélectionnez un adhérent.');
  if(!tpl) return alert(`Aucun modèle de diplôme image trouvé dans le bucket "${DIPLOME_BUCKET}".`);
  // Confirmation si la ceinture du modèle ne correspond pas à l'adhérent
  const tplBelt=(tpl.name||'').toLowerCase();
  const adhBelt=(adh.couleur_ceinture||'').toLowerCase();
  if(adhBelt && tplBelt && !tplBelt.includes(adhBelt)){
    if(!confirm(`⚠️ Le modèle sélectionné ("${tpl.label}") ne correspond pas à la ceinture de ${adh.prenom} ${adh.nom} ("${adh.couleur_ceinture}").\n\nContinuer quand même ?`)) return;
  }
  try{
    const jsPDF=await ensureJsPDF();
    const diplomeData={
      titre:UI.diplome.titre||'Diplôme de ceinture',
      nomComplet:`${adh.nom||''} ${adh.prenom||''}`.trim(),
      nom:adh.nom||'',
      prenom:adh.prenom||'',
      licence:adh.numero_licence||'Non renseigné',
      ceinture:adh.couleur_ceinture||'',
      date:UI.diplome.date||td(),
      templateUrl:tpl.url,
      logoUrl:D.logoUrl||FORCED_LOGO_URL,
      signatureUrl:D.clubInfo?.[DIPLOME_SIGNATURE_KEY]||'',
      layout:selectedDiplomeLayout()
    };
    const canvas=await buildDiplomeCanvas(diplomeData);
    const imgData=canvas.toDataURL('image/png');
    const pdf=new jsPDF({orientation:'landscape',unit:'pt',format:'a4',compress:true});
    pdf.addImage(imgData,'PNG',0,0,DIPLOME_PAGE.pdfWidthPt,DIPLOME_PAGE.pdfHeightPt,undefined,'FAST');
    const safeName=`diplome_${(adh.nom||'').trim()}_${(adh.prenom||'').trim()}_${(UI.diplome.date||td())}`
    .replace(/\s+/g,'_')
    .replace(/[^a-zA-Z0-9_.-]+/g,'');
    pdf.save(`${safeName||'diplome'}.pdf`);
    // Log de l'émission du diplôme dans les notes de l'adhérent
    const logLine=`[Diplôme émis le ${td()} - ${tpl.label}]`;
    const newNotes=(adh.notes?adh.notes+'\n':'')+logLine;
    await SB.from('adherents').update({notes:newNotes,updated_at:new Date().toISOString()}).eq('id',adh.id);
    adh.notes=newNotes;
    // Archivage de la saison en cours : la saison est calculée et figée à l'émission,
    // elle ne sera jamais recalculée si la convention de saison change plus tard.
    const emissionDate=UI.diplome.date||td();
    const saison=seasonFromDate(emissionDate)||currentSeasonLabel();
    // Conservation d'une copie PDF du diplôme dans R2, pour traçabilité/historique
    // (jusqu'ici, le PDF n'était que téléchargé dans le navigateur, sans aucune trace côté club).
    let pdfStoragePath=null;
    try{
      const pdfBlob=pdf.output('blob');
      const archivePath=`${DIPLOME_PDF_PREFIX}/${saison}/${safeName||'diplome'}_${Date.now()}.pdf`;
      const {error:uploadError}=await SB.storage.from(DIPLOME_PDF_BUCKET).upload(archivePath,pdfBlob);
      if(uploadError) throw uploadError;
      pdfStoragePath=archivePath;
    }catch(archiveError){
      // L'archivage est une amélioration de traçabilité : s'il échoue (ex. bucket non
      // configuré), on n'empêche pas la génération du diplôme, on prévient juste l'utilisateur.
      notify('error','Diplôme généré mais non archivé (PDF) : '+(archiveError?.message||archiveError),'Diplômes');
    }
    // Envoi automatique du diplôme par email à l'adhérent (si une adresse est renseignée).
    // Non bloquant : un échec d'envoi n'empêche jamais la génération/l'archivage du diplôme.
    if(adh.email){
      try{
        const pdfBase64=pdf.output('datauristring').split(',')[1];
        const clubNom=esc(D.clubInfo?.nom||DEFAULT_CLUB_NAME);
        const res=await fetch('/api/email/send',{
          method:'POST',
          credentials:'same-origin',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            to:[{email:adh.email,name:`${adh.prenom||''} ${adh.nom||''}`.trim()}],
            subject:`Votre diplôme — ${UI.diplome.titre||'Diplôme de ceinture'} — ${clubNom}`,
            html:`<p>Bonjour ${esc(adh.prenom||'')},</p>
<p>Félicitations ! Vous trouverez ci-joint votre diplôme${adh.couleur_ceinture?` de ceinture <strong>${esc(adh.couleur_ceinture)}</strong>`:''}, daté du ${fd(emissionDate)}.</p>
<p>Sportivement,<br>${clubNom}</p>`,
            attachments:[{name:`${safeName||'diplome'}.pdf`,content:pdfBase64}],
          })
        });
        if(res.ok){
          notify('success',`Diplôme également envoyé par email à ${adh.email}.`,'Diplômes');
        }else{
          const err=await res.json().catch(()=>({}));
          notify('warn','Diplôme généré mais email non envoyé : '+(err?.error?.message||res.status),'Diplômes');
        }
      }catch(emailError){
        notify('warn','Diplôme généré mais email non envoyé : '+(emailError?.message||emailError),'Diplômes');
      }
    }
    // Enregistrement dans la table diplomes (persistant et requêtable, par saison)
    await SB.from('diplomes').insert({
      id:crypto.randomUUID(),
      adherent_id:adh.id,
      nom:adh.nom||'',
      prenom:adh.prenom||'',
      titre:UI.diplome.titre||'Diplôme de ceinture',
      ceinture:adh.couleur_ceinture||'',
      date_emission:emissionDate,
      saison,
      modele:tpl.label||tpl.name||'',
      pdf_storage_path:pdfStoragePath,
      delivre_par:UI.diplome.delivrePar||null,
      commentaire:UI.diplome.commentaire||null,
      created_at:new Date().toISOString()
    });
    await loadDiplomeArchive(true); // rafraîchit l'historique affiché dans l'onglet Diplômes
    notify('success',`Diplôme de ${adh.prenom} ${adh.nom} généré et tracé (saison ${saison}).`,'Diplômes');
  }catch(error){
    alert('Export PDF impossible : '+(error?.message||error));
  }
}

// Impression batch : génère un PDF multi-pages pour une liste d'adhérents
async function printDiplomeBatch(adherentIds){
  if(!adherentIds||!adherentIds.length) return alert('Sélectionnez au moins un adhérent.');
  const tpl=selectedDiplomeTemplate();
  if(!tpl) return alert(`Aucun modèle de diplôme image trouvé.`);
  const adhs=adherentIds.map(id=>D.adherents.find(a=>a.id===id)).filter(Boolean);
  if(!adhs.length) return alert('Aucun adhérent valide trouvé.');
  try{
    const jsPDF=await ensureJsPDF();
    const pdf=new jsPDF({orientation:'landscape',unit:'pt',format:'a4',compress:true});
    let first=true;
    const date=UI.diplome.date||td();
    const saison=seasonFromDate(date)||currentSeasonLabel();
    const batchRecords=[];
    for(const adh of adhs){
      if(!first) pdf.addPage();
      first=false;
      // Deviner le modèle selon la ceinture de chaque adhérent
      const bestTpl=D.diplomeTemplates.find(t=>t.name.toLowerCase().includes((adh.couleur_ceinture||'').toLowerCase()))||tpl;
      const canvas=await buildDiplomeCanvas({
        nomComplet:`${adh.nom||''} ${adh.prenom||''}`.trim(),
        nom:adh.nom||'',prenom:adh.prenom||'',
        licence:adh.numero_licence||'Non renseigné',
        ceinture:adh.couleur_ceinture||'',
        date,
        templateUrl:bestTpl.url,
        logoUrl:D.logoUrl||FORCED_LOGO_URL,
        signatureUrl:D.clubInfo?.[DIPLOME_SIGNATURE_KEY]||'',
        layout:selectedDiplomeLayout()
      });
      pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,DIPLOME_PAGE.pdfWidthPt,DIPLOME_PAGE.pdfHeightPt,undefined,'FAST');
      batchRecords.push({adh,modele:bestTpl.label||bestTpl.name||''});
    }
    pdf.save(`diplomes_batch_${date}.pdf`);
    // Archivage d'une seule copie PDF du lot complet (toutes les pages), référencée
    // par chaque ligne de la table diplomes pour ce lot.
    let pdfStoragePath=null;
    try{
      const pdfBlob=pdf.output('blob');
      const archivePath=`${DIPLOME_PDF_PREFIX}/${saison}/batch_${date}_${adhs.length}adherents_${Date.now()}.pdf`;
      const {error:uploadError}=await SB.storage.from(DIPLOME_PDF_BUCKET).upload(archivePath,pdfBlob);
      if(uploadError) throw uploadError;
      pdfStoragePath=archivePath;
    }catch(archiveError){
      notify('error','Lot généré mais non archivé (PDF) : '+(archiveError?.message||archiveError),'Diplômes batch');
    }
    const rows=batchRecords.map(({adh,modele})=>({
      id:crypto.randomUUID(),
      adherent_id:adh.id,
      nom:adh.nom||'',
      prenom:adh.prenom||'',
      titre:UI.diplome.titre||'Diplôme de ceinture',
      ceinture:adh.couleur_ceinture||'',
      date_emission:date,
      saison,
      modele,
      pdf_storage_path:pdfStoragePath,
      delivre_par:UI.diplome.delivrePar||null,
      commentaire:UI.diplome.commentaire||null,
      created_at:new Date().toISOString()
    }));
    await SB.from('diplomes').insert(rows);
    await loadDiplomeArchive(true);
    notify('success',`${adhs.length} diplôme(s) générés et tracés (saison ${saison}).`,'Diplômes batch');
  }catch(err){
    alert('Génération batch impossible : '+(err?.message||err));
  }
}

async function saveDiplomeSignatureUrl(url){
  if(!requireWritePerm('perm_adherents')) return;
  const value=(url||'').trim();
  const {error}=await SB.from('club_info').upsert({cle:DIPLOME_SIGNATURE_KEY,valeur:value},{onConflict:'cle'});
  if(error) return alert('Enregistrement de la signature impossible : '+error.message);
  D.clubInfo[DIPLOME_SIGNATURE_KEY]=value;
  render();
}

async function importDiplomeSignature(e){
  const file=e.target.files[0];
  e.target.value='';
  if(!file) return;
  if(!requireWritePerm('perm_adherents')) return;
  if(!SB?.storage) return alert(`${storageProviderLabel()} indisponible.`);
  const safeName=(file.name||'signature.png').replace(/[^a-zA-Z0-9._-]+/g,'_');
  const path=`club-assets/signature/${Date.now()}_${safeName}`;
  const {error:upErr}=await SB.storage.from(DIPLOME_BUCKET).upload(path,file,{upsert:false,contentType:file.type||'image/png'});
  if(upErr) return alert('Upload de la signature impossible : '+upErr.message);
  const {data:pub}=SB.storage.from(DIPLOME_BUCKET).getPublicUrl(path);
  await saveDiplomeSignatureUrl(pub?.publicUrl||'');
  alert('Signature importée.');
}

function vDiplomes(){
  const adhList=sortAdherentsList([...D.adherents]);
  const adh=selectedDiplomeAdherent() || adhList[0] || null;
  if(!UI.diplome.adherentId && adh) UI.diplome.adherentId=adh.id;
  const tpl=selectedDiplomeTemplate();
  const layout=selectedDiplomeLayout();
  const html=adh?buildDiplomeHTML({
    titre:UI.diplome.titre||'Diplôme de ceinture',
    nomComplet:`${adh.nom||''} ${adh.prenom||''}`.trim(),
                                  nom:adh.nom||'',
                                  prenom:adh.prenom||'',
                                  licence:adh.numero_licence||'Non renseigné',
                                  ceinture:adh.couleur_ceinture||'',
                                  date:UI.diplome.date||td(),
                                  templateUrl:tpl?.url||'',
                                  layout
  },'preview'):'';
  const currentField=selectedDiplomeField();
  const currentFieldMeta=selectedDiplomeFieldMeta();
  return `<div class="view-head">
  <div>
  <div class="eyebrow">Documents sportifs</div>
  <h2>Diplômes</h2>
  <p>Chaque modèle dispose maintenant de son propre réglage libre. Vous pouvez déplacer les champs directement dans l’aperçu puis enregistrer la configuration.</p>
  </div>
  </div>
  <div class="dipl-grid">
  <div style="display:flex;flex-direction:column;gap:14px">
  <div class="card">
  <div class="fg" style="margin-bottom:12px">
  <label>Adhérent</label>
  <select onchange="UI.diplome.adherentId=this.value;render()">
  ${adhList.map(a=>`<option value="${a.id}" ${UI.diplome.adherentId===a.id?'selected':''}>${a.nom} ${a.prenom}${a.couleur_ceinture?` — ${a.couleur_ceinture}`:''}</option>`).join('')}
  </select>
  </div>
  <div class="g2">
  <div class="fg">
  <label>Date du diplôme</label>
  <input type="date" value="${UI.diplome.date||td()}" onchange="UI.diplome.date=this.value;render()">
  </div>
  <div class="fg">
  <label>Modèle sélectionné</label>
  <input value="${tpl?.label||'Aucun modèle'}" disabled>
  </div>
  </div>
  ${adh?`<div class="card" style="margin-top:14px;padding:12px 14px;background:rgba(255,255,255,.58)">
    <div style="font-size:11px;color:var(--txt2);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Données adhérent utilisées</div>
    <div style="font-size:13px;line-height:1.8"><strong>${adh.nom} ${adh.prenom}</strong><br>Nom : ${adh.nom||'—'}<br>Prénom : ${adh.prenom||'—'}<br>Licence : ${adh.numero_licence||'Non renseigné'}<br>Date imprimée : ${fd(UI.diplome.date||td())}</div>
    </div>`:`<div class="empty">Aucun adhérent disponible.</div>`}
    <div class="card" style="margin-top:14px;padding:12px 14px;background:rgba(255,255,255,.58)">
    <div style="font-size:11px;color:var(--txt2);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Fichier de notation</div>
    ${adh?`<div style="font-size:13px;line-height:1.8">${adh.pdf_public_url?`PDF lié : <strong>${esc(adh.pdf_nom_fichier||'document.pdf')}</strong>`:'Aucun PDF de notation importé.'}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
    <button class="btn" onclick="trigPDF('adherents','${adh.id}')">${adh.pdf_public_url?'Remplacer le PDF':'Importer le PDF'}</button>
    ${adh.pdf_public_url?`<a class="btn" href="${adh.pdf_public_url}" target="_blank">Ouvrir le PDF</a>`:''}
    </div>`:`<div class="empty" style="padding:18px 12px">Sélectionnez un adhérent.</div>`}
    </div>
    <div class="card" style="margin-top:14px;padding:12px 14px;background:rgba(255,255,255,.58)">
    <div style="font-size:11px;color:var(--txt2);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Visuels du diplôme</div>
    <div style="font-size:13px;line-height:1.8">Logo : ${D.logoUrl?'<strong>logo du club chargé</strong>':'non disponible'}<br>Signature : ${D.clubInfo?.[DIPLOME_SIGNATURE_KEY]?'<strong>signature chargée</strong>':'non définie'}</div>
    <div class="fg" style="margin-top:10px">
    <label>URL publique de la signature</label>
    <input id="diplome-signature-url" value="${esc(D.clubInfo?.[DIPLOME_SIGNATURE_KEY]||'')}" placeholder="https://.../signature.png">
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
    <button class="btn" onclick="document.getElementById('diplome-signature-input').click()">Importer la signature</button>
    <button class="btn" onclick="saveDiplomeSignatureUrl(document.getElementById('diplome-signature-url').value)">Enregistrer l’URL</button>
    </div>
    </div>
    <div class="g2" style="margin-top:14px">
    <div class="fg">
    <label>Délivré par (enseignant / jury)</label>
    <input value="${esc(UI.diplome.delivrePar||'')}" placeholder="Ex. Serge Suivant" oninput="UI.diplome.delivrePar=this.value">
    </div>
    <div class="fg">
    <label>Commentaire (facultatif)</label>
    <input value="${esc(UI.diplome.commentaire||'')}" placeholder="Ex. Passage de grade juin 2026…" oninput="UI.diplome.commentaire=this.value">
    </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
    <button class="btn primary" onclick="printDiplome()" ${!adh||!tpl?'disabled':''}>⬇ Télécharger le PDF</button>
    <button class="btn" onclick="openDiplomeBatchModal()" ${!tpl||!adhList.length?'disabled':''} title="Générer un PDF multi-pages pour plusieurs adhérents">📋 Impression batch</button>
    <button class="btn gold" onclick="saveDiplomeLayouts()" ${!tpl?'disabled':''}>💾 Sauvegarder ce modèle</button>
    <button class="btn" onclick="resetCurrentDiplomeLayout()" ${!tpl?'disabled':''}>↺ Réinitialiser le modèle</button>
    <button class="btn" onclick="loadDiplomeTemplates().then(()=>render())">↻ Recharger les modèles</button>
    </div>
    </div>
    <div class="card dipl-editor-card">
    <div style="font-size:11px;color:var(--txt2);text-transform:uppercase;letter-spacing:.08em">Édition libre</div>
    <div class="dipl-field-list">
    ${DIPLOME_FIELD_META.map(meta=>`<button class="dipl-field-chip ${UI.diplome.selectedField===meta.key?'active':''}" type="button" onclick="selectDiplomeField('${meta.key}')">${meta.label}</button>`).join('')}
    </div>
    <div class="dipl-help">Cliquez sur un champ puis déplacez-le dans l’aperçu. Les réglages sont mémorisés par modèle d’image.</div>
    <div class="dipl-editor-grid">
    <div class="fg">
    <label>Champ actif</label>
    <input value="${currentFieldMeta.label}" disabled>
    </div>
    <div class="fg">
    <label>Visible</label>
    <select onchange="updateDiplomeField('${UI.diplome.selectedField}','enabled',this.value==='1')">
    <option value="1" ${currentField.enabled?'selected':''}>Oui</option>
    <option value="0" ${!currentField.enabled?'selected':''}>Non</option>
    </select>
    </div>
    <div class="fg">
    <label>Position X (%)</label>
    <input type="number" min="0" max="100" step="0.1" value="${currentField.left}" onchange="updateDiplomeField('${UI.diplome.selectedField}','left',this.value)">
    </div>
    <div class="fg">
    <label>Position Y (%)</label>
    <input type="number" min="0" max="100" step="0.1" value="${currentField.top}" onchange="updateDiplomeField('${UI.diplome.selectedField}','top',this.value)">
    </div>
    <div class="fg">
    <label>Largeur (%)</label>
    <input type="number" min="4" max="100" step="0.1" value="${currentField.width}" onchange="updateDiplomeField('${UI.diplome.selectedField}','width',this.value)">
    </div>
    ${currentFieldMeta.type==='image'?`
      <div class="fg">
      <label>Hauteur (%)</label>
      <input type="number" min="2" max="100" step="0.1" value="${currentField.height}" onchange="updateDiplomeField('${UI.diplome.selectedField}','height',this.value)">
      </div>
      <div class="fg">
      <label>Alignement</label>
      <select onchange="updateDiplomeField('${UI.diplome.selectedField}','align',this.value)">
      <option value="left" ${currentField.align==='left'?'selected':''}>Gauche</option>
      <option value="center" ${currentField.align==='center'?'selected':''}>Centre</option>
      <option value="right" ${currentField.align==='right'?'selected':''}>Droite</option>
      </select>
      </div>
      <div class="fg">
      <label>Ajustement image</label>
      <select onchange="updateDiplomeField('${UI.diplome.selectedField}','objectFit',this.value)">
      <option value="contain" ${currentField.objectFit==='contain'?'selected':''}>Contain</option>
      <option value="cover" ${currentField.objectFit==='cover'?'selected':''}>Cover</option>
      <option value="fill" ${currentField.objectFit==='fill'?'selected':''}>Fill</option>
      </select>
      </div>`:`
      <div class="fg">
      <label>Taille police (px)</label>
      <input type="number" min="8" max="96" step="1" value="${currentField.fontSize}" onchange="updateDiplomeField('${UI.diplome.selectedField}','fontSize',this.value)">
      </div>
      <div class="fg full">
      <label>Police</label>
      <select onchange="updateDiplomeField('${UI.diplome.selectedField}','fontFamily',this.value)">
      ${DIPLOME_FONT_OPTIONS.map(opt=>`<option value="${esc(opt.value)}" ${currentField.fontFamily===opt.value?'selected':''}>${opt.label}</option>`).join('')}
      </select>
      </div>
      <div class="fg">
      <label>Alignement</label>
      <select onchange="updateDiplomeField('${UI.diplome.selectedField}','align',this.value)">
      <option value="left" ${currentField.align==='left'?'selected':''}>Gauche</option>
      <option value="center" ${currentField.align==='center'?'selected':''}>Centre</option>
      <option value="right" ${currentField.align==='right'?'selected':''}>Droite</option>
      </select>
      </div>
      <div class="fg">
      <label>Graisse</label>
      <select onchange="updateDiplomeField('${UI.diplome.selectedField}','fontWeight',this.value)">
      <option value="400" ${currentField.fontWeight==='400'?'selected':''}>Normal</option>
      <option value="500" ${currentField.fontWeight==='500'?'selected':''}>Medium</option>
      <option value="600" ${currentField.fontWeight==='600'?'selected':''}>Semi-gras</option>
      <option value="700" ${currentField.fontWeight==='700'?'selected':''}>Gras</option>
      </select>
      </div>
      <div class="fg">
      <label>Style</label>
      <select onchange="updateDiplomeField('${UI.diplome.selectedField}','fontStyle',this.value)">
      <option value="normal" ${currentField.fontStyle!=='italic'?'selected':''}>Normal</option>
      <option value="italic" ${currentField.fontStyle==='italic'?'selected':''}>Italique</option>
      </select>
      </div>
      <div class="fg">
      <label>Interlettrage</label>
      <input type="number" min="-2" max="20" step="0.1" value="${currentField.letterSpacing||0}" onchange="updateDiplomeField('${UI.diplome.selectedField}','letterSpacing',this.value)">
      </div>
      <div class="fg">
      <label>Couleur</label>
      <input type="color" value="${currentField.color||'#16110d'}" onchange="updateDiplomeField('${UI.diplome.selectedField}','color',this.value)">
      </div>`}
      </div>
      </div>
      <div class="card">
      <div style="font-size:11px;color:var(--txt2);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Modèles disponibles</div>
      ${D.diplomeTemplates.length
        ? `<div class="dipl-thumbs">${D.diplomeTemplates.map(t=>`<button class="dipl-thumb ${UI.diplome.templatePath===t.path?'active':''}" type="button" onclick="UI.diplome.templatePath='${t.path.replace(/'/g,"\\'")}';render()"><img src="${t.url}" alt="${t.label}"><span>${t.label}</span></button>`).join('')}</div>`
        : `<div class="empty">${D.diplomeTemplatesError?`Impossible de lister le bucket <strong>${DIPLOME_BUCKET}</strong> : ${esc(D.diplomeTemplatesError)}.`:`Aucun modèle d'image PNG/JPG/WebP trouvé dans le bucket <strong>${DIPLOME_BUCKET}</strong>.`}</div>`}
        </div>
        </div>
        <div class="dipl-preview-wrap">
        <div class="dipl-preview-toolbar">
        <div style="font-size:11px;color:var(--txt2);text-transform:uppercase;letter-spacing:.08em">Aperçu</div>
        <div class="dipl-preview-hint">Glissez un champ pour modifier son emplacement.</div>
        </div>
        ${adh?`<div>${html}</div>`:`<div class="empty">Sélectionnez un adhérent pour prévisualiser le diplôme.</div>`}
        </div>
        </div>
        ${vDiplomesArchive()}`;
}

function vDiplomesArchive(){
  const seasons=diplomeArchiveSeasons();
  const rows=diplomeArchiveFiltered();
  const filter=UI.diplomeArchive.saison;
  const total=D.diplomes.length;
  return `<div class="card" style="margin-top:18px">
  <div class="view-head" style="margin-bottom:12px">
  <div>
  <div class="eyebrow">Traçabilité</div>
  <h3 style="margin:0">Historique des diplômes émis</h3>
  <p style="margin:4px 0 0;font-size:13px;color:var(--txt2)">Chaque diplôme est archivé avec sa saison, pour garder une trace même après le départ d'un adhérent. ${total} au total.</p>
  </div>
  <div style="display:flex;gap:8px;align-items:center">
  <button class="btn" onclick="exportDiplomesCSV()">⬇ CSV</button>
  <button class="btn" onclick="loadDiplomeArchive(true).then(()=>render())">↻ Actualiser</button>
  </div>
  </div>
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;align-items:flex-end">
  <div class="fg" style="min-width:180px;flex:1">
  <label>Rechercher un membre</label>
  <input value="${esc(UI.diplomeArchive.search||'')}" placeholder="Nom, prénom…" oninput="UI.diplomeArchive.search=this.value;render()">
  </div>
  <div class="fg" style="min-width:160px">
  <label>Saison</label>
  <select onchange="UI.diplomeArchive.saison=this.value;render()">
  <option value="current" ${filter==='current'?'selected':''}>Saison en cours (${currentSeasonLabel()})</option>
  <option value="all" ${filter==='all'?'selected':''}>Toutes les saisons</option>
  ${seasons.map(s=>`<option value="${s}" ${filter===s?'selected':''}>${s}</option>`).join('')}
  </select>
  </div>
  </div>
  ${rows.length?`<div style="overflow-x:auto"><table class="tbl">
  <thead><tr><th>Adhérent</th><th>Ceinture</th><th>Titre</th><th>Date</th><th>Saison</th><th>Délivré par</th><th>Modèle</th><th>Archive PDF</th>${hasPerm('perm_adherents','write')?'<th></th>':''}</tr></thead>
  <tbody>
  ${rows.map(d=>`<tr>
  <td>${esc(d.nom||'')} ${esc(d.prenom||'')}</td>
  <td>${esc(d.ceinture||'—')}</td>
  <td>${esc(d.titre||'—')}${d.commentaire?`<br><span style="font-size:11px;color:var(--txt2)">${esc(d.commentaire)}</span>`:''}</td>
  <td>${fd(d.date_emission)}</td>
  <td>${esc(d.saison||'—')}</td>
  <td>${esc(d.delivre_par||'—')}</td>
  <td>${esc(d.modele||'—')}</td>
  <td>${d.pdf_storage_path?`<a class="btn sm" href="${buildStorageObjectUrl(DIPLOME_PDF_BUCKET,d.pdf_storage_path)}" target="_blank">⬇ PDF</a>`:'—'}</td>
  ${hasPerm('perm_adherents','write')?`<td><button class="btn sm" style="color:var(--red)" onclick="deleteDiplome('${d.id}')" title="Supprimer cet enregistrement">✕</button></td>`:''}
  </tr>`).join('')}
  </tbody>
  </table></div>
  <p style="font-size:12px;color:var(--txt2);margin-top:8px">${rows.length} diplôme(s) affiché(s) sur ${total} au total.</p>`:`<div class="empty">Aucun diplôme archivé pour cette sélection.</div>`}
  </div>`;
}
 
async function deleteDiplome(id){
  if(!hasPerm('perm_adherents','write')) return;
  if(!confirm('Supprimer cet enregistrement de diplôme ? Cette action est irréversible.')) return;
  const {error}=await SB.from('diplomes').delete().eq('id',id);
  if(error){notify('error','Suppression échouée : '+(error.message||error),'Diplômes');return;}
  D.diplomes=D.diplomes.filter(d=>d.id!==id);
  notify('success','Enregistrement supprimé.','Diplômes');
  render();
}
 
function exportDiplomesCSV(){
  const rows=diplomeArchiveFiltered();
  if(!rows.length){notify('warn','Aucun diplôme à exporter pour cette sélection.','Diplômes');return;}
  const header=['Nom','Prénom','Ceinture','Titre','Date d\'émission','Saison','Délivré par','Modèle','Commentaire','PDF archivé'];
  const lines=rows.map(d=>[
    d.nom||'',d.prenom||'',d.ceinture||'',d.titre||'',d.date_emission||'',
    d.saison||'',d.delivre_par||'',d.modele||'',d.commentaire||'',
    d.pdf_storage_path?'Oui':'Non'
  ].map(c=>`"${String(c).replace(/"/g,'""')}"`).join(';'));
  dl('\uFEFF'+[header.join(';'),...lines].join('\n'),`diplomes_${td()}.csv`,'text/csv;charset=utf-8');
  notify('success',`${rows.length} diplôme(s) exporté(s).`,'Diplômes');
}

let diplomeDragState=null;

function startDiplomeFieldDrag(ev,key){
  if(ev.button!==0) return;
  ev.preventDefault();
  ev.stopPropagation();
  const preview=document.getElementById('diplome-preview-surface');
  if(!preview) return;
  const rect=preview.getBoundingClientRect();
  const field=selectedDiplomeLayout().fields[key];
  if(!field) return;
  const changedField=UI.diplome.selectedField!==key;
  UI.diplome.selectedField=key;
  const anchorX=rect.left + rect.width*(field.left/100);
  const anchorY=rect.top + rect.height*(field.top/100);
  diplomeDragState={key,rect,offsetX:ev.clientX-anchorX,offsetY:ev.clientY-anchorY,dirty:false};
  if(changedField) render();
}

window.addEventListener('mousemove',ev=>{
  if(!diplomeDragState) return;
  const {key,rect,offsetX,offsetY}=diplomeDragState;
  const left=((ev.clientX-offsetX)-rect.left)/rect.width*100;
  const top=((ev.clientY-offsetY)-rect.top)/rect.height*100;
  const layout=selectedDiplomeLayout();
  layout.fields[key]=normalizeDiplomeField(key,{...layout.fields[key],left,top});
  diplomeDragState.dirty=true;
  updateDraggedFieldElement(key,layout.fields[key]);
  syncDiplomeEditorInputs(layout.fields[key]);
});

window.addEventListener('mouseup',()=>{
  if(diplomeDragState?.dirty) render();
  diplomeDragState=null;
});

// ═══════════════════════════════════════════════════
// BANQUE
// ═══════════════════════════════════════════════════
function vBanque(){
  const canWrite=hasPerm('perm_banque','write');
  const sub=UI.subTab.banque;
  return`<div class="stabs">
  <button class="stab ${sub==='comptes'?'active':''}" onclick="showST('banque','comptes')">Comptes</button>
  <button class="stab ${sub==='import'?'active':''}" onclick="showST('banque','import')">Import CM</button>
  <button class="stab ${sub==='rappr'?'active':''}" onclick="showST('banque','rappr')">Rapprochement</button>
  <button class="stab ${sub==='ecr512'?'active':''}" onclick="showST('banque','ecr512')">Écritures 512</button>
  </div>
  ${sub==='comptes'?vComptes():sub==='import'?vBankImport():sub==='rappr'?vRappr():vEcr512()}`;
}

function vComptes(){
  const canWrite=hasPerm('perm_banque','write');
  if(UI.bankAccountId){
    const c=D.comptes.find(x=>x.id===UI.bankAccountId);
    if(c) return vCompteDetail(c);
    UI.bankAccountId=null;
  }
  return`${canWrite?`<button class="btn primary" style="margin-bottom:14px" onclick="openModal('compte')">+ Ajouter un compte</button>`:''}
  ${D.comptes.map(c=>{
    const tr=[...(c.transactions||[])].sort((a,b)=>compareFrDates(b.date_op,a.date_op));
    const cr=tr.reduce((s,t)=>s+(+t.credit),0);
    const db=tr.reduce((s,t)=>s+(+t.debit),0);
    const sol=(+c.solde_initial)+cr-db;
    return`<div class="card" style="margin-bottom:10px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
    <div><div style="font-weight:500">${c.nom}</div><div style="font-size:11px;color:var(--txt2)">${c.numero||''}</div></div>
    <div style="font-size:18px;font-weight:500;color:${sol>=0?'#1e7e34':'var(--red)'}">${sol.toLocaleString('fr-FR',{minimumFractionDigits:2})} €</div>
    </div>
    <div class="g3">
    <div style="font-size:12px;color:var(--txt2)">Initial : <strong>${(+c.solde_initial).toFixed(2)} €</strong></div>
    <div style="font-size:12px;color:#1e7e34">+ ${cr.toFixed(2)} €</div>
    <div style="font-size:12px;color:var(--red)">- ${db.toFixed(2)} €</div>
    </div>
    <div style="margin-top:10px;display:flex;justify-content:flex-end">
    <button class="btn sm" onclick="openBankAccount('${c.id}')">Consulter les opérations</button>
    </div>
    ${tr.length>0?`<div class="wrap" style="margin-top:8px"><table>
      <thead><tr><th>Date</th><th>Valeur</th><th>Libellé</th><th>Débit</th><th>Crédit</th><th>Rapproché</th></tr></thead>
      <tbody>${tr.slice(0,5).map(t=>`<tr><td>${fd(frDateToISO(t.date_op)||t.date_op)||''}</td>
      <td style="font-size:11px;color:var(--txt2)">${fd(t.date_valeur)||'—'}</td>
      <td>${t.libelle}</td>
      <td style="color:var(--red);text-align:right">${+t.debit>0?(+t.debit).toFixed(2)+' €':''}</td>
      <td style="color:#1e7e34;text-align:right">${+t.credit>0?(+t.credit).toFixed(2)+' €':''}</td>
      <td>${t.rapproche?`<span class="badge bok">✓</span>`:`<span class="badge bwarn">En attente</span>`}</td>
      </tr>`).join('')}</tbody>
      </table></div>`:''}
      </div>`;
  }).join('')}`;
}

function openBankAccount(id){
  UI.bankAccountId=id;
  UI.subTab.banque='comptes';
  render();
}

function closeBankAccount(){
  UI.bankAccountId=null;
  render();
}

function buildSoldeParMois(transactions, soldeInitial=0){
  const byMonth={};
  (transactions||[]).forEach(t=>{
    const iso=frDateToISO(t.date_op)||t.date_op||'';
    const key=iso.slice(0,7);
    if(!key||key.length<7) return;
    if(!byMonth[key]) byMonth[key]={cr:0,db:0};
    byMonth[key].cr+=(+t.credit||0);
    byMonth[key].db+=(+t.debit||0);
  });
  const keys=Object.keys(byMonth).sort();
  let cumul=soldeInitial;
  return keys.map(k=>{
    cumul+=byMonth[k].cr-byMonth[k].db;
    const [y,m]=k.split('-');
    const label=new Date(+y,+m-1,1).toLocaleDateString('fr-FR',{month:'short',year:'2-digit'});
    return{key:k,label,solde:+cumul.toFixed(2)};
  });
}

function vCompteDetail(c){
  const searchTx=(UI.bankTxSearch||'').toLowerCase().trim();
  const filterRappr=UI.bankTxRapprFilter||'';
  const filterDateFrom=UI.bankTxDateFrom||'';
  const filterDateTo=UI.bankTxDateTo||'';
  const allTr=[...(c.transactions||[])].sort((a,b)=>{
    return compareFrDates(b.date_op,a.date_op);
  });
  const tr=allTr.filter(t=>{
    if(searchTx && !(t.libelle||'').toLowerCase().includes(searchTx)) return false;
    if(filterRappr==='rapproche' && !t.rapproche) return false;
    if(filterRappr==='attente' && t.rapproche) return false;
    if(filterDateFrom){
      const iso=frDateToISO(t.date_op)||t.date_op||'';
      if(iso && iso<filterDateFrom) return false;
    }
    if(filterDateTo){
      const iso=frDateToISO(t.date_op)||t.date_op||'';
      if(iso && iso>filterDateTo) return false;
    }
    return true;
  });
  const cr=allTr.reduce((s,t)=>s+(+t.credit),0);
  const db=allTr.reduce((s,t)=>s+(+t.debit),0);
  const sol=(+c.solde_initial)+cr-db;
  const soldeOfficiel=UI[`soldeOfficiel_${c.id}`]??'';
  const ecartSolde=soldeOfficiel!==''?+(sol-+soldeOfficiel).toFixed(2):null;

  // Graphique mini d'évolution du solde mois par mois
  const soldeParMois=buildSoldeParMois(allTr,+c.solde_initial);
  const maxSolde=Math.max(...soldeParMois.map(x=>x.solde),0.01);
  const minSolde=Math.min(...soldeParMois.map(x=>x.solde),0);
  const range=maxSolde-minSolde||1;
  const chartH=48;const chartW=280;
  const pts=soldeParMois.map((x,i)=>{
    const px=i/(soldeParMois.length-1||1)*chartW;
    const py=chartH-((x.solde-minSolde)/range)*chartH;
    return`${px.toFixed(1)},${py.toFixed(1)}`;
  }).join(' ');

  return`<div class="view-head">
  <div>
  <div class="eyebrow">Consultation bancaire</div>
  <h2>${c.nom}</h2>
  <p>Consultez l'ensemble des opérations importées pour ce compte, avec le statut de rapprochement et les montants débit/crédit.</p>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
  <button class="btn" onclick="closeBankAccount()">Retour aux comptes</button>
  </div>
  </div>
  <div class="g4" style="margin-bottom:14px">
  <div class="sc"><div class="v">${allTr.length}</div><div class="l">Opérations</div></div>
  <div class="sc"><div class="v vg">${cr.toFixed(2)} €</div><div class="l">Crédits</div></div>
  <div class="sc"><div class="v vr">${db.toFixed(2)} €</div><div class="l">Débits</div></div>
  <div class="sc"><div class="v ${sol>=0?'vg':'vr'}">${sol.toFixed(2)} €</div><div class="l">Solde théorique</div></div>
  </div>
  <div class="card" style="margin-bottom:12px;display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap">
  <div style="flex:1;min-width:200px">
  <div style="font-size:12px;font-weight:600;margin-bottom:6px">Évolution du solde</div>
  ${soldeParMois.length>1?`<svg viewBox="0 0 ${chartW} ${chartH}" width="${chartW}" height="${chartH}" style="display:block">
    <polyline points="${pts}" fill="none" stroke="var(--blue,#378ADD)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${soldeParMois.map((x,i)=>{const px=i/(soldeParMois.length-1||1)*chartW;const py=chartH-((x.solde-minSolde)/range)*chartH;return`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="2.5" fill="${x.solde>=0?'#1e7e34':'#b33627'}"><title>${x.label} : ${x.solde.toFixed(2)} €</title></circle>`;}).join('')}
  </svg>
  <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--txt2);margin-top:2px">
  <span>${soldeParMois[0]?.label||''}</span><span>${soldeParMois[soldeParMois.length-1]?.label||''}</span>
  </div>`:'<p style="font-size:11px;color:var(--txt2)">Pas assez de données</p>'}
  </div>
  <div style="min-width:220px">
  <div style="font-size:12px;font-weight:600;margin-bottom:6px">Solde officiel du relevé</div>
  <div style="display:flex;gap:8px;align-items:center">
  <input type="number" step="0.01" value="${soldeOfficiel}" placeholder="ex: 1234.56"
    style="width:130px;padding:4px 8px;border:1px solid var(--brd);border-radius:6px"
    oninput="UI['soldeOfficiel_${c.id}']=this.value;render()">
  <span style="font-size:11px;color:var(--txt2)">€</span>
  </div>
  ${ecartSolde!==null?`<div style="margin-top:8px;font-size:12px;font-weight:600;color:${Math.abs(ecartSolde)<0.01?'#1e7e34':'#b33627'}">
  Écart : ${ecartSolde>=0?'+':''}${ecartSolde.toFixed(2)} €
  ${Math.abs(ecartSolde)>0.01?'<span style="font-size:10px;margin-left:4px">⚠️ Différence à vérifier</span>':'<span style="font-size:10px;margin-left:4px">✓ Concordant</span>'}
  </div>`:'<div style="font-size:11px;color:var(--txt2);margin-top:6px">Saisir le solde pour calculer l\'écart</div>'}
  </div>
  </div>
  <div class="toolbar" style="margin-bottom:12px">
  <input style="flex:1;min-width:180px" placeholder="🔍 Rechercher dans les libellés..." value="${UI.bankTxSearch||''}" oninput="UI.bankTxSearch=this.value;render()">
  <select style="width:auto" onchange="UI.bankTxRapprFilter=this.value;render()">
  <option value="" ${!filterRappr?'selected':''}>Toutes</option>
  <option value="rapproche" ${filterRappr==='rapproche'?'selected':''}>Rapprochées</option>
  <option value="attente" ${filterRappr==='attente'?'selected':''}>En attente</option>
  </select>
  <input type="date" title="Du" value="${filterDateFrom}" style="width:auto" onchange="UI.bankTxDateFrom=this.value;render()">
  <input type="date" title="Au" value="${filterDateTo}" style="width:auto" onchange="UI.bankTxDateTo=this.value;render()">
  <button class="btn" onclick="UI.bankTxSearch='';UI.bankTxRapprFilter='';UI.bankTxDateFrom='';UI.bankTxDateTo='';render()">Réinitialiser</button>
  ${searchTx||filterRappr||filterDateFrom||filterDateTo?`<span style="font-size:12px;color:var(--txt2);align-self:center">${tr.length}/${allTr.length} ligne(s)</span>`:''}
  </div>
  <div class="card" style="margin-bottom:14px">
  <div style="font-size:12px;color:var(--txt2)">Numéro de compte</div>
  <div style="font-weight:600;margin-top:4px">${c.numero||'Non renseigné'}</div>
  </div>
  <div class="wrap"><table>
  <thead><tr><th>Date</th><th>Valeur</th><th>Libellé</th><th>Débit</th><th>Crédit</th><th>Rapproché</th><th>Pièce(s)</th><th></th></tr></thead>
  <tbody>${tr.map(t=>{
    let piecesLiees=[];
    if(t.rapproche){
      if(t.ecriture_pieces_json){try{piecesLiees=JSON.parse(t.ecriture_pieces_json);}catch(e){}}
      if(!piecesLiees.length&&t.ecriture_piece)piecesLiees=[t.ecriture_piece];
    }
    return`<tr>
    <td>${fd(frDateToISO(t.date_op)||t.date_op)||''}</td>
    <td>${fd(t.date_valeur)||'—'}</td>
    <td>${t.libelle||''}</td>
    <td style="color:var(--red);text-align:right">${+t.debit>0?(+t.debit).toFixed(2)+' €':'-'}</td>
    <td style="color:#1e7e34;text-align:right">${+t.credit>0?(+t.credit).toFixed(2)+' €':'-'}</td>
    <td>${t.rapproche?`<span class="badge bok">✓</span>`:`<span class="badge bwarn">En attente</span>`}</td>
    <td style="font-size:11px;color:var(--txt2)">${piecesLiees.length?piecesLiees.map(p=>`<span class="badge bok" style="margin-right:2px">${esc(p)}</span>`).join(''):'—'}</td>
    <td>${t.rapproche?`<button class="btn sm bwarn" onclick="modifierRapprochement('${t.id}')" title="Corriger le rapprochement" style="font-size:10px;padding:2px 6px">✎</button>`:''}
    </td>
    </tr>`;}).join('')}
    ${tr.length===0?`<tr><td colspan="8" class="empty">${searchTx||filterRappr||filterDateFrom||filterDateTo?'Aucune opération pour ce filtre':'Aucune opération sur ce compte'}</td></tr>`:''}
    </tbody>
    </table></div>`;
}

function vBankPreviewModal(){
  const p=UI.bankPreview;
  if(!p) return '';
  const rows=p.rows;
  const totalDebit=rows.reduce((s,r)=>s+(+r.debit||0),0);
  const totalCredit=rows.reduce((s,r)=>s+(+r.credit||0),0);
  const off=p.officialTotals;
  const debitMatch=off && Math.abs(off.debit-totalDebit)<0.01;
  const creditMatch=off && (off.credit==null || Math.abs(off.credit-totalCredit)<0.01);
  const totalsOk=off ? (debitMatch && creditMatch) : null;
  const toVerifyCount=rows.filter(r=>r.a_verifier).length;

  return`<div class="modal" style="max-width:900px">
  <h2>📄 Vérification avant import</h2>
  <p style="font-size:12px;color:var(--txt2);margin-bottom:12px">Relisez les opérations détectées avant de les enregistrer. Comparez les totaux ci-dessous à ceux affichés sur le PDF (ligne « Total des mouvements »).</p>

  <div class="g4" style="margin-bottom:12px">
  <div class="sc"><div class="v">${rows.length}</div><div class="l">Opérations détectées</div></div>
  <div class="sc"><div class="v vr">${totalDebit.toFixed(2)} €</div><div class="l">Total débit calculé</div></div>
  <div class="sc"><div class="v vg">${totalCredit.toFixed(2)} €</div><div class="l">Total crédit calculé</div></div>
  <div class="sc"><div class="v ${toVerifyCount?'vr':'vg'}">${toVerifyCount}</div><div class="l">À vérifier</div></div>
  </div>

  ${off?`<div class="card" style="margin-bottom:12px;background:${totalsOk?'rgba(30,126,52,.08)':'rgba(220,53,69,.08)'}">
    <div style="font-weight:600;margin-bottom:4px">${totalsOk?'✓ Les totaux correspondent au relevé':'⚠ Écart avec le total annoncé sur le relevé'}</div>
    <div style="font-size:12px;color:var(--txt2)">Relevé PDF — Débit : <strong>${off.debit.toFixed(2)} €</strong>${off.credit!=null?` · Crédit : <strong>${off.credit.toFixed(2)} €</strong>`:''}</div>
    ${!totalsOk?`<div style="font-size:12px;color:var(--red);margin-top:4px">Vérifiez les lignes ci-dessous avant de valider : une opération a peut-être été fusionnée, mal découpée ou non reconnue.</div>`:''}
    </div>`:`<div class="card" style="margin-bottom:12px"><div style="font-size:12px;color:var(--txt2)">⚠ Total officiel non détecté automatiquement dans le PDF — vérifiez manuellement la cohérence avec votre relevé.</div></div>`}

  ${p.skippedDuplicates?`<p style="font-size:12px;color:var(--txt2);margin-bottom:8px">${p.skippedDuplicates} opération(s) déjà présente(s) dans le compte ont été ignorées.</p>`:''}
  ${p.usedFallback?`<p style="font-size:12px;color:var(--gold-d);margin-bottom:8px">⚠ Lecture par positions indisponible : ce relevé a été interprété avec la méthode de repli (texte brut), moins précise. Vérifiez attentivement les lignes ci-dessous.</p>`:''}

  <div class="wrap" style="max-height:360px;overflow-y:auto"><table>
  <thead><tr><th>Date</th><th>Libellé</th><th>Débit</th><th>Crédit</th><th></th></tr></thead>
  <tbody>${rows.map((r,i)=>`<tr style="${r.a_verifier?'background:rgba(220,53,69,.06)':''}">
    <td>${fd(frDateToISO(r.date_op)||r.date_op)||''}</td>
    <td>${esc(r.libelle||'')}${r.a_verifier?`<div style="font-size:11px;color:var(--red);margin-top:2px">⚠ ${esc(r.a_verifier_raison||'À vérifier')}</div>`:''}</td>
    <td style="color:var(--red);text-align:right">${+r.debit>0?(+r.debit).toFixed(2)+' €':'-'}</td>
    <td style="color:#1e7e34;text-align:right">${+r.credit>0?(+r.credit).toFixed(2)+' €':'-'}</td>
    <td><button class="btn sm" onclick="removeBankPreviewRow(${i})" title="Retirer cette ligne de l'import">✕</button></td>
    </tr>`).join('')}
    </tbody></table></div>

  <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
  <button class="btn" onclick="cancelBankImport()">Annuler</button>
  <button class="btn primary" onclick="confirmBankImport()">✓ Valider l'import (${rows.length})</button>
  </div>
  </div>`;
}

function removeBankPreviewRow(i){
  if(!UI.bankPreview) return;
  UI.bankPreview.rows.splice(i,1);
  if(!UI.bankPreview.rows.length){ cancelBankImport(); return; }
  renderModal();
}

function vBankImport(){
  const canWrite=hasPerm('perm_banque','write');
  return`<div style="margin-bottom:12px"><label>Compte cible</label>
  <select id="cible-cpt" style="max-width:280px">${D.comptes.map(c=>`<option value="${c.id}">${c.nom}</option>`).join('')}</select>
  </div>
  <div class="card" style="margin-bottom:12px">
  <p style="font-weight:600;margin-bottom:6px">PDF Crédit Mutuel</p>
  <p style="font-size:12px;color:var(--txt2);margin-bottom:10px">Importe les lignes d'un extrait de compte PDF texte. Un écran de vérification s'affiche avant l'enregistrement, avec comparaison des totaux au relevé. Si le PDF est scanné comme image, l'import ne pourra pas lire les opérations.</p>
  ${canWrite?`<button class="btn primary" onclick="document.getElementById('bank-pdf-input').click()">📄 Importer un PDF</button>`:''}
  </div>
  <div class="dz" onclick="document.getElementById('csv-bank').click()" style="margin-bottom:10px">
  <div style="font-size:32px;margin-bottom:8px">📄</div>
  <p style="font-size:13px;font-weight:500">Importer un CSV Crédit Mutuel</p>
  <p style="font-size:11px;color:var(--txt2);margin-top:4px">Format : Date;Libellé;Débit;Crédit;Solde</p>
  </div>`;
}

function vRappr(){
  const all=D.comptes.flatMap(c=>(c.transactions||[]).map(t=>({...t,cname:c.nom})));
  const nonR=all.filter(t=>!t.rapproche);
  const doneR=all.filter(t=>t.rapproche);
  const autoCount=nonR.filter(t=>{ const r=bestRapprochementEntry(t); return r?.auto; }).length;
  const suggestCount=nonR.filter(t=>{ const r=bestRapprochementEntry(t); return r && !r.auto; }).length;
  const grouped=findGroupedRapprochement(all);

  const groupPanel=grouped.length?`
  <div class="card" style="margin-bottom:14px;border-left:3px solid var(--gold-d)">
  <div style="font-weight:600;margin-bottom:8px">🔗 ${grouped.length} regroupement(s) bancaire(s) détecté(s)</div>
  <p style="font-size:12px;color:var(--txt2);margin-bottom:10px">Ces groupes de transactions correspondent ensemble à une même écriture comptable (remise de chèques, virement groupé HelloAsso).</p>
  ${grouped.map(g=>`
    <div style="background:var(--bg2);border-radius:6px;padding:10px;margin-bottom:8px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px">
    <div>
      <span class="badge bblue" style="margin-right:6px">Pièce : ${esc(g.piece)}</span>
      <span class="badge bgray">${g.nbTx} transaction(s) → ${g.amount.toFixed(2)} €</span>
    </div>
    <button class="btn sm primary" onclick="validerGroupeRapprochement(${JSON.stringify(g.transactionIds)},'${esc(g.piece)}')">✓ Valider</button>
    </div>
    <div style="margin-top:8px;font-size:11px;color:var(--txt2)">
    ${g.transactions.map(t=>`<div style="padding:2px 0">${fd(frDateToISO(t.date_op)||t.date_op)||''} — ${esc(t.libelle||'')} — ${((+t.credit||0)+(+t.debit||0)).toFixed(2)} €</div>`).join('')}
    </div>
    </div>`).join('')}
  </div>`:'';

  const rows=all.map((t,i)=>{
    const result=!t.rapproche?bestRapprochementEntry(t):null;
    const confidence=result?Math.round((result.score/5)*100):0;
    const confBadge=result?(result.auto?`<span class="badge bok">Haute ${confidence}%</span>`:`<span class="badge bwarn">Moyenne ${confidence}%</span>`):`<span class="badge bgray">—</span>`;
    let piecesLiees=[];
    if(t.rapproche){
      if(t.ecriture_pieces_json){try{piecesLiees=JSON.parse(t.ecriture_pieces_json);}catch(e){}}
      if(!piecesLiees.length&&t.ecriture_piece)piecesLiees=[t.ecriture_piece];
    }
    const multiSel=UI.rapprMultiSel[t.id]||[];
    const ecritureCell=t.rapproche
      ?`<div>${piecesLiees.map(p=>`<span class="badge bok" style="margin-right:3px;margin-bottom:3px">${esc(p)}</span>`).join('')}${piecesLiees.length>1?`<div style="font-size:10px;color:var(--txt2);margin-top:2px">${piecesLiees.length} pièces liées</div>`:''}</div>`
      :`<div style="font-size:11px">
        <div style="margin-bottom:4px">
        <select style="font-size:11px;padding:3px 6px;width:auto" id="ecr-${i}">
          <option value="">-- Pièce unique --</option>
          ${D.journal.map(j=>`<option value="${esc(j.piece||j.id.slice(0,8))}" ${suggestRapprochementPiece(t)===(j.piece||j.id.slice(0,8))?'selected':''}>${esc(j.piece||'')} ${esc((j.libelle||'').slice(0,20))}</option>`).join('')}
        </select>
        </div>
        <details style="margin-top:4px">
        <summary style="font-size:10px;cursor:pointer;color:var(--txt2)">🔗 Multi-rapprochement (remise chèques / virement groupé)</summary>
        <div style="margin-top:6px;max-height:140px;overflow-y:auto;border:1px solid var(--border);border-radius:4px;padding:4px">
        ${D.journal.map(j=>{const pk=j.piece||j.id.slice(0,8);const checked=multiSel.includes(pk);return`<label style="display:flex;align-items:center;gap:6px;padding:2px 4px;font-size:11px;cursor:pointer;${checked?'background:rgba(30,126,52,.08);border-radius:3px':''}"><input type="checkbox" ${checked?'checked':''} onchange="toggleMultiSel('${t.id}','${esc(pk)}')">${esc(pk)} — ${esc((j.libelle||'').slice(0,22))} (${((+j.credit||0)-(+j.debit||0)).toFixed(2)} €)</label>`;}).join('')}
        </div>
        ${multiSel.length?`<div style="margin-top:6px;font-size:11px;color:#1e7e34">${multiSel.length} pièce(s) cochée(s)</div>`:''}
        </details>
      </div>`;
    const actionCell=t.rapproche
      ?`<div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn sm bwarn" onclick="modifierRapprochement('${t.id}')" title="Choisir une autre écriture">✎ Corriger</button>
          <button class="btn sm" style="background:var(--red);color:#fff" onclick="annulerRapprochement('${t.id}')" title="Annuler le rapprochement">✕</button>
        </div>`
      :`<div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn sm" onclick="rapprocher('${t.id}',${i})">✓ Valider</button>
          ${multiSel.length?`<button class="btn sm primary" onclick="rapprocherMulti('${t.id}')">🔗 Multi (${multiSel.length})</button>`:''}
        </div>`;
    return`<tr>
    <td>${fd(frDateToISO(t.date_op)||t.date_op)||''}</td>
    <td>${esc(t.libelle||'')}</td>
    <td style="font-size:11px">${esc(t.cname||'')}</td>
    <td style="color:var(--red);text-align:right">${+t.debit>0?(+t.debit).toFixed(2)+' €':'-'}</td>
    <td style="color:#1e7e34;text-align:right">${+t.credit>0?(+t.credit).toFixed(2)+' €':'-'}</td>
    <td>${ecritureCell}</td>
    <td>${t.rapproche?'':confBadge}</td>
    <td>${t.rapproche?`<span class="badge bok">✓ Rapprochée</span>`:`<span class="badge bwarn">En attente</span>`}</td>
    <td>${actionCell}</td>
    </tr>`;
  }).join('');

  return`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
  <div>
  <strong>${nonR.length} en attente · ${doneR.length} rapprochée(s)</strong>
  ${autoCount||suggestCount?`<div style="font-size:11px;color:var(--txt2);margin-top:3px">${autoCount?`<span style="color:#1e7e34">● ${autoCount} fiable(s)</span>`:''} ${suggestCount?`<span style="color:var(--gold-d)">● ${suggestCount} à valider</span>`:''}</div>`:''}
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
  <button class="btn sm gold" onclick="preselectRapprochements()">⚡ Pré-sélection auto</button>
  <button class="btn sm primary" onclick="toutRappr()">Tout rapprocher</button>
  </div>
  </div>
  ${groupPanel}
  ${all.length===0?`<div class="empty">Importez d'abord un relevé bancaire</div>`:`
  <div class="wrap"><table>
  <thead><tr><th>Date</th><th>Libellé</th><th>Compte</th><th>Débit</th><th>Crédit</th><th>Écriture(s)</th><th>Confiance</th><th>Statut</th><th>Actions</th></tr></thead>
  <tbody>${rows}</tbody>
  </table></div>`}`;
}
function vEcr512(){
  const e=D.journal.filter(j=>j.compte&&j.compte.startsWith('512'));
  const sol=e.reduce((s,j)=>s+(+j.credit)-(+j.debit),0);
  return`<div style="margin-bottom:12px"><div class="sc" style="display:inline-block;min-width:200px">
  <div class="v ${sol>=0?'vg':'vr'}">${sol.toFixed(2)} €</div><div class="l">Solde 512 — Banque</div>
  </div></div>
  <div class="gl-acc">
  <div class="gl-hdr"><strong>512 — Banque</strong><span style="font-size:12px;color:var(--txt2)">${e.length} écriture(s)</span></div>
  <div class="gl-row gl-head"><span>Date</span><span>Libellé</span><span style="text-align:right">Débit</span><span style="text-align:right">Crédit</span><span style="text-align:right">Solde</span></div>
  ${(()=>{let s=0;return e.map(j=>{s+=(+j.credit)-(+j.debit);return`<div class="gl-row">
    <span>${fd(j.date_op)}</span><span>${j.libelle}<br><span style="font-size:10px;color:var(--txt2)">${j.piece||''}</span></span>
    <span style="color:var(--red);text-align:right">${+j.debit>0?(+j.debit).toFixed(2)+' €':''}</span>
    <span style="color:#1e7e34;text-align:right">${+j.credit>0?(+j.credit).toFixed(2)+' €':''}</span>
    <span style="text-align:right;font-weight:500;color:${s>=0?'#1e7e34':'var(--red)'}">${s.toFixed(2)} €</span>
    </div>`;}).join('');})()}
    ${e.length===0?`<div class="empty">Aucune écriture 512</div>`:''}
    </div>`;
}

// ═══════════════════════════════════════════════════
// COMPTABILITÉ
// ═══════════════════════════════════════════════════
function vCompta(){
  const sub=UI.subTab.compta;
  return`<div class="stabs">
  <button class="stab ${sub==='journal'?'active':''}" onclick="showST('compta','journal')">Journal</button>
  <button class="stab ${sub==='gl'?'active':''}" onclick="showST('compta','gl')">Grand livre</button>
  <button class="stab ${sub==='bilan'?'active':''}" onclick="showST('compta','bilan')">Bilan</button>
  <button class="stab ${sub==='res'?'active':''}" onclick="showST('compta','res')">Résultat</button>
  <button class="stab ${sub==='exo'?'active':''}" onclick="showST('compta','exo')">Exercices</button>
  </div>
  ${sub==='journal'?vJournal():sub==='gl'?vGL():sub==='bilan'?vBilan():sub==='res'?vResultat():vExercices()}`;
}

function jnlForExo(exoId){return exoId?D.journal.filter(j=>j.exercice_id===exoId):D.journal}
function jnlExo(){return D.currentExo?jnlForExo(D.currentExo.id):D.journal}

function rowFallsWithinExercice(row, exo){
  const date=row?.date_op||'';
  if(!date||!exo) return false;
  if(exo.date_debut&&date<exo.date_debut) return false;
  if(exo.date_fin&&date>exo.date_fin) return false;
  return true;
}

function normalizePieceGroupKey(piece){
  const p=(piece||'').trim();
  if(!p) return '__SANS_PIECE__';
  if(/^ADH-[^-]+-(ENC|COT|PAS)$/.test(p)) return p.replace(/-(ENC|COT|PAS)$/,'');
  if(/^(ACH|VTE)-[^-]+-(CHG|CTR|CLI|PRO)$/.test(p)) return p.replace(/-(CHG|CTR|CLI|PRO)$/,'');
  if(/-L[12]$/.test(p)) return p.replace(/-L[12]$/,'');
  return p;
}

function orphanJournalDiagnostics(){
  const rows=D.journal.filter(j=>!j.exercice_id);
  const totalDebit=rows.reduce((s,j)=>s+(+j.debit||0),0);
  const totalCredit=rows.reduce((s,j)=>s+(+j.credit||0),0);
  const withinCurrent=rows.filter(j=>rowFallsWithinExercice(j,D.currentExo));
  const beforeCurrent=rows.filter(j=>D.currentExo?.date_debut && (j.date_op||'')<D.currentExo.date_debut);
  const afterCurrent=rows.filter(j=>D.currentExo?.date_fin && (j.date_op||'')>D.currentExo.date_fin);
  return {
    rows,totalDebit,totalCredit,ecart:+(totalDebit-totalCredit).toFixed(2),
    withinCurrent,beforeCurrent,afterCurrent
  };
}

function pieceBalanceDiagnostics(rows){
  const groups={};
  (rows||[]).forEach((row,idx)=>{
    const key=normalizePieceGroupKey(row.piece);
    if(!groups[key]) groups[key]={key,piece:key==='__SANS_PIECE__'?'Sans pièce':key,rows:[],debit:0,credit:0,firstDate:row.date_op||td(),index:idx};
    groups[key].rows.push(row);
    groups[key].debit+=+row.debit||0;
    groups[key].credit+=+row.credit||0;
  });
  return Object.values(groups)
  .map(g=>({...g,ecart:+(g.debit-g.credit).toFixed(2)}))
  .filter(g=>Math.abs(g.ecart)>=0.01)
  .sort((a,b)=>Math.abs(b.ecart)-Math.abs(a.ecart));
}

function compteCode(compte){
  const m=(compte||'').match(/^(\d+)/);
  return m?m[1]:'';
}

function findPlanCompte(codePrefix,fallback='471 - Comptes d attente'){
  return PLAN.find(p=>p.startsWith(codePrefix))||fallback;
}

function issueKeywords(issue){
  const text=[issue.piece,...issue.rows.map(r=>r.libelle||''),...issue.rows.map(r=>r.compte||'')].join(' ').toLowerCase();
  return{
    adh:/adh|cotis|licenc|inscription|pass région|pass region/.test(text),
    don:/don|mécénat|mecenat/.test(text),
    vente:/vente|client|facture|prest|stage|cours/.test(text),
    achat:/achat|fourn|facture achat|note de frais|matériel|materiel/.test(text),
    banque:/virement|cb|carte|banque|vir\b|helloasso|prélèvement|prelevement/.test(text),
    caisse:/esp[eè]ces|caisse/.test(text),
    subvention:/subvention|aide|pass région|pass region/.test(text),
    textile:/textile|tenue|t[- ]?shirt|sweat/.test(text),
    equipement:/matériel|materiel|équipement|equipement/.test(text),
  };
}

function buildEquilibreSuggestions(issue){
  const keywords=issueKeywords(issue);
  const rows=issue.rows||[];
  const needSide=issue.ecart>0?'credit':'debit';
  const amount=Math.abs(issue.ecart);
  const exactAccounts=[...new Set(rows.map(r=>r.compte).filter(Boolean))];
  const codes=exactAccounts.map(compteCode).filter(Boolean);
  const codeSet=new Set(codes);
  const byPrefix=(prefix)=>codes.some(code=>code.startsWith(prefix));
  const sideText=needSide==='credit'?'un crédit':'un débit';
  const pieceType=(issue.piece||'').startsWith('ACH-')||keywords.achat?'achat'
  :(issue.piece||'').startsWith('VTE-')||keywords.vente?'vente'
  :(issue.piece||'').startsWith('ADH-')||keywords.adh?'adhesion'
  :'general';
  const suggestions=[];
  const seen=new Set();
  const addSuggestion=(compte,reason,score)=>{
    if(!compte || seen.has(compte)) return;
    seen.add(compte);
    suggestions.push({compte,reason,score});
  };

  if(pieceType==='achat'){
    if(needSide==='credit'){
      addSuggestion(findPlanCompte('401'),'Piece de type achat avec excedent de debit : un credit fournisseur est souvent la contrepartie attendue.',96);
      addSuggestion(keywords.caisse?findPlanCompte('5300'):findPlanCompte('512'),'Si la depense a ete reglee immediatement, la contrepartie peut etre la banque ou la caisse.',88);
    }else{
      const chargeExistante=exactAccounts.find(c=>/^6/.test(compteCode(c)));
      addSuggestion(chargeExistante||findPlanCompte(keywords.textile?'6052':keywords.equipement?'6051':'606'),'Le credit depasse le debit : il manque souvent la charge achetee en face du reglement ou de la dette.',94);
      addSuggestion(findPlanCompte('401'),'Si la facture fournisseur a ete saisie seule, un debit fournisseur peut aussi etre attendu.',72);
    }
  }else if(pieceType==='vente'){
    if(needSide==='debit'){
      addSuggestion(findPlanCompte('411'),'Piece de vente avec excedent de credit : il manque souvent la creance client.',96);
      addSuggestion(keywords.caisse?findPlanCompte('5300'):findPlanCompte('512'),'Si la vente a ete reglee tout de suite, le debit peut concerner la banque ou la caisse.',90);
    }else{
      const produitExistant=exactAccounts.find(c=>/^7/.test(compteCode(c)));
      addSuggestion(produitExistant||findPlanCompte('706'),'Le debit depasse le credit : il manque probablement le produit de la vente.',92);
      addSuggestion(findPlanCompte('7080'),'Alternative utile si la piece concerne un produit annexe ou accessoire.',70);
    }
  }else if(pieceType==='adhesion'){
    if(needSide==='debit'){
      addSuggestion(keywords.caisse?findPlanCompte('5300'):findPlanCompte('512'),'Pour une adhesion ou licence, le debit manquant correspond souvent au reglement encaisse.',95);
      addSuggestion(findPlanCompte('411'),'Si le membre n a pas encore regle, la contrepartie peut etre un compte adherent/client.',84);
    }else{
      if(keywords.subvention){
        addSuggestion(findPlanCompte('7410'),'Le libelle evoque une aide ou un Pass Region : un produit de subvention est plausible.',95);
      }
      if(keywords.don){
        addSuggestion(findPlanCompte('754'),'Le libelle evoque un don : un credit en dons manuels est plausible.',94);
      }
      addSuggestion(findPlanCompte('7561'),'Pour une adhesion, le credit manquant correspond souvent a la cotisation.',92);
      addSuggestion(findPlanCompte('7562'),'A utiliser si la piece concerne plutot licence ou adhesion annexe.',82);
    }
  }else{
    if(needSide==='credit'){
      if(byPrefix('6')) addSuggestion(findPlanCompte('401'),'Des comptes de charges sont presents et le debit depasse le credit : une dette fournisseur est probable.',90);
      if(byPrefix('2')) addSuggestion(findPlanCompte('401'),'Une immobilisation semble presente : la contrepartie peut etre un fournisseur ou une dette liee a l acquisition.',72);
      addSuggestion(keywords.caisse?findPlanCompte('5300'):findPlanCompte('512'),'Si l operation est payee comptant, la contrepartie peut etre financiere.',68);
    }else{
      if(byPrefix('7')) addSuggestion(findPlanCompte('411'),'Des produits sont presents et le credit depasse le debit : une creance client ou adherent est probable.',90);
      if(byPrefix('40')) addSuggestion(exactAccounts.find(c=>/^6/.test(compteCode(c)))||findPlanCompte('606'),'Une dette fournisseur est presente : il manque peut etre la charge correspondante.',80);
      addSuggestion(keywords.caisse?findPlanCompte('5300'):findPlanCompte('512'),'Si l operation est deja reglee, un debit banque ou caisse peut etre la bonne contrepartie.',66);
    }
  }

  if(needSide==='debit' && !codeSet.has('512') && !codeSet.has('5300')){
    addSuggestion(keywords.caisse?findPlanCompte('5300'):findPlanCompte('512'),`Suggestion financiere de repli : la piece semble demander ${sideText} de ${amount.toFixed(2)} €.`,40);
  }
  if(needSide==='credit' && !codeSet.has('401') && byPrefix('6')){
    addSuggestion(findPlanCompte('401'),`Suggestion de repli : une charge apparait sans contrepartie complete, il manque peut etre ${sideText}.`,38);
  }
  if(needSide==='debit' && !codeSet.has('411') && byPrefix('7')){
    addSuggestion(findPlanCompte('411'),`Suggestion de repli : un produit apparait sans contrepartie complete, il manque peut etre ${sideText}.`,38);
  }
  addSuggestion(findPlanCompte('471'),'Compte d attente de securite si la bonne imputation n est pas encore connue.',10);

  return{
    needSide,
    amount,
    pieceType,
    exactAccounts,
    suggestions:suggestions.sort((a,b)=>b.score-a.score).slice(0,4)
  };
}

function exerciceDiagnostics(exoId){
  const rows=jnlForExo(exoId);
  const totalDebit=rows.reduce((s,j)=>s+(+j.debit||0),0);
  const totalCredit=rows.reduce((s,j)=>s+(+j.credit||0),0);
  const produits=rows.filter(j=>j.compte&&/^7/.test(j.compte)).reduce((s,j)=>s+(+j.credit||0),0);
  const charges=rows.filter(j=>j.compte&&/^6/.test(j.compte)).reduce((s,j)=>s+(+j.debit||0),0);
  const resultat=+(produits-charges).toFixed(2);
  const ecartJournal=+(totalDebit-totalCredit).toFixed(2);
  const issues=pieceBalanceDiagnostics(rows);
  return{rows,totalDebit,totalCredit,produits,charges,resultat,ecartJournal,issues};
}

function nextExerciceDefaults(exo){
  const startBase=exo?.date_fin?new Date(exo.date_fin):new Date();
  const start=new Date(startBase);
  start.setDate(start.getDate()+1);
  const end=new Date(start);
  end.setFullYear(end.getFullYear()+1);
  end.setDate(end.getDate()-1);
  const startIso=start.toISOString().split('T')[0];
  const endIso=end.toISOString().split('T')[0];
  const startYear=start.getFullYear();
  const endYear=end.getFullYear();
  return{
    libelle:`Exercice ${startYear}-${endYear}`,
    date_debut:startIso,
    date_fin:endIso
  };
}

async function deleteJournalPiecePrefix(prefix){
  const rows=D.journal.filter(j=>(j.piece||'').startsWith(prefix));
  if(!rows.length) return;
  const ids=rows.map(r=>r.id);
  const {error}=await SB.from('journal_comptable').delete().in('id',ids);
  if(error) throw error;
  D.journal=D.journal.filter(j=>!ids.includes(j.id));
}

async function regulariserEquilibreExo(){
  if(!requireWritePerm('perm_comptabilite')) return;
  if(!D.currentExo) return alert('Aucun exercice sélectionné.');
  const issues=pieceBalanceDiagnostics(jnlExo());
  if(!issues.length) return alert('Le journal de cet exercice est déjà équilibré.');
  if(!confirm(`Créer des écritures de régularisation sur le compte 471 pour ${issues.length} pièce(s) déséquilibrée(s) ?`)) return;
  const rows=issues.map((issue,idx)=>({
    date_op:issue.firstDate||td(),
                                      piece:issue.key==='__SANS_PIECE__'?`REGUL-SANSPIECE-${idx+1}`:issue.key,
                                      compte:'471 - Comptes d attente',
                                      libelle:`Régularisation équilibre - ${issue.piece}`,
                                      debit:issue.ecart<0?Math.abs(issue.ecart):0,
                                      credit:issue.ecart>0?issue.ecart:0,
                                      exercice_id:D.currentExo?.id||null
  }));
  try{
    await insertJournalRows(rows);
  }catch(error){
    return alert('Erreur : '+error.message);
  }
  render();
  alert(`Régularisation terminée : ${rows.length} écriture(s) ajoutée(s) au compte 471.`);
}

function openEquilibreAssistant(){
  UI.modal='equilibre_help';
  UI.editObj=null;
  renderModal();
}

function getEquilibreIssue(issueKey){
  return pieceBalanceDiagnostics(jnlExo()).find(issue=>issue.key===issueKey)||null;
}

async function regulariserPieceEquilibre(issueKey){
  return regulariserPieceEquilibreAvecCompte(issueKey,'471 - Comptes d attente','Régularisation équilibre');
}

async function regulariserPieceEquilibreAvecCompte(issueKey,compte,reason='Régularisation équilibre'){
  if(!requireWritePerm('perm_comptabilite')) return;
  if(!D.currentExo) return alert('Aucun exercice sélectionné.');
  const issue=getEquilibreIssue(issueKey);
  if(!issue) return alert('Cette pièce semble déjà équilibrée.');
  if(!confirm(`Créer ${issue.ecart>0?'un crédit':'un débit'} de ${Math.abs(issue.ecart).toFixed(2)} € sur ${compte} pour la pièce ${issue.piece} ?`)) return;
  const row={
    date_op:issue.firstDate||td(),
    piece:issue.key==='__SANS_PIECE__'?`REGUL-SANSPIECE-${Date.now()}`:issue.key,
    compte,
    libelle:`${reason} - ${issue.piece}`,
    debit:issue.ecart<0?Math.abs(issue.ecart):0,
    credit:issue.ecart>0?issue.ecart:0,
    exercice_id:D.currentExo?.id||null
  };
  try{
    await insertJournalRows([row]);
  }catch(error){
    return alert('Erreur : '+error.message);
  }
  render();
}

function vJournal(){
  const canWrite=hasPerm('perm_comptabilite','write');
  const jnl=jnlExo();
  const tD=jnl.reduce((s,j)=>s+(+j.debit),0),tC=jnl.reduce((s,j)=>s+(+j.credit),0);
  const ecart=+(tD-tC).toFixed(2);
  const issues=pieceBalanceDiagnostics(jnl);
  const orphanDiag=orphanJournalDiagnostics();
  return`<div class="view-head">
  <div>
  <div class="eyebrow">Pilotage financier</div>
  <h2>Journal comptable</h2>
  <p>Consultez les écritures de l'exercice actif, surveillez l'équilibre débit/crédit et enregistrez rapidement de nouvelles opérations.</p>
  </div>
  </div>
  <div class="g3" style="margin-bottom:14px">
  <div class="sc"><div class="v vr">${tD.toFixed(2)} €</div><div class="l">Total débits</div></div>
  <div class="sc"><div class="v vg">${tC.toFixed(2)} €</div><div class="l">Total crédits</div></div>
  <div class="sc"><div class="v ${ecart===0?'vg':'vr'}">${ecart.toFixed(2)} €</div><div class="l">Écart débit/crédit</div></div>
  </div>
  ${orphanDiag.rows.length?`<div class="card" style="margin-bottom:12px;padding:12px 16px;font-size:12px;color:${orphanDiag.withinCurrent.length?'var(--red)':'var(--gold-d)'}">${orphanDiag.withinCurrent.length?`Écritures sans exercice détectées dans l’exercice actif : <strong>${orphanDiag.withinCurrent.length}</strong>.`:`Écritures non rattachées détectées hors de la période de l’exercice actif : <strong>${orphanDiag.rows.length}</strong>.`}<div style="margin-top:6px;color:var(--txt2)">Débit : ${orphanDiag.totalDebit.toFixed(2)} € · Crédit : ${orphanDiag.totalCredit.toFixed(2)} € · Écart : ${orphanDiag.ecart.toFixed(2)} €</div><div style="margin-top:6px;color:var(--txt2)">${D.currentExo?.date_debut&&D.currentExo?.date_fin?`Exercice actif : ${fd(D.currentExo.date_debut)} → ${fd(D.currentExo.date_fin)}.`:''}${orphanDiag.beforeCurrent.length?` Avant période : ${orphanDiag.beforeCurrent.length}.`:''}${orphanDiag.afterCurrent.length?` Après période : ${orphanDiag.afterCurrent.length}.`:''}${orphanDiag.withinCurrent.length?` À corriger dans la période active : ${orphanDiag.withinCurrent.length}.`:' Aucune écriture sans exercice dans la période active.'}</div></div>`:''}
  <div class="card" style="margin-bottom:12px;padding:12px 16px;font-size:12px;color:${ecart===0?'#1e7e34':'var(--red)'}">${ecart===0?'Journal équilibré sur l’exercice sélectionné.':'Le journal n’est pas équilibré. Vérifiez les anciennes écritures manuelles ou importées.'}${issues.length?`<div style="margin-top:8px;color:var(--txt)">Pièces déséquilibrées détectées : <strong>${issues.length}</strong>${issues.slice(0,3).map(i=>`<div style="margin-top:4px;font-size:11px;color:var(--txt2)">${i.piece} : ${i.ecart.toFixed(2)} €</div>`).join('')}</div>`:''}</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
  ${canWrite?`<button class="btn primary" onclick="openModal('ecr')">+ Nouvelle écriture</button>`:''}
  ${canWrite?`<button class="btn" onclick="openEcritureType('cotisation')" title="Écriture type encaissement cotisation">⚡ Cotisation</button>`:''}
  ${canWrite?`<button class="btn" onclick="openEcritureType('achat_fournisseur')" title="Écriture type paiement fournisseur">⚡ Achat</button>`:''}
  ${canWrite?`<button class="btn" onclick="openEcritureType('subvention')" title="Écriture type subvention/don">⚡ Subvention</button>`:''}
  <button class="btn" onclick="openEquilibreAssistant()">Assistant déséquilibres${issues.length?` (${issues.length})`:''}</button>
  ${canWrite&&issues.length?`<button class="btn gold" onclick="regulariserEquilibreExo()">Équilibrer l'exercice</button>`:''}
  </div>
  <div class="wrap">
  <div style="display:grid;grid-template-columns:90px 70px 1fr 90px 90px;gap:8px;padding:6px 0;font-size:11px;color:var(--txt2);font-weight:500;border-bottom:.5px solid var(--brd2)">
  <span>Date</span><span>Pièce</span><span>Compte / Libellé</span><span style="text-align:right">Débit</span><span style="text-align:right">Crédit</span>
  </div>
  ${jnl.map(j=>`<div style="display:grid;grid-template-columns:90px 70px 1fr 90px 90px;gap:8px;padding:7px 0;border-bottom:.5px solid var(--brd);font-size:12px;align-items:center">
    <span>${fd(j.date_op)}</span>
    <span style="font-size:11px;color:var(--txt2)">${j.piece||''}</span>
    <span><strong style="font-weight:500">${j.compte}</strong><br><span style="font-size:11px;color:var(--txt2)">${j.libelle}</span></span>
    <span style="color:var(--red);text-align:right;font-weight:500">${+j.debit>0?(+j.debit).toFixed(2)+' €':''}</span>
    <span style="color:#1e7e34;text-align:right;font-weight:500">${+j.credit>0?(+j.credit).toFixed(2)+' €':''}</span>
    </div>`).join('')}
    ${jnl.length===0?`<div class="empty">Aucune écriture</div>`:''}
    </div>`;
}

function vGL(){
  const jnl=jnlExo();
  // Tri des écritures par date pour un solde progressif correct dans chaque compte
  const sorted=[...jnl].sort((a,b)=>(a.date_op||'').localeCompare(b.date_op||''));
  const by={};
  sorted.forEach(j=>{if(!by[j.compte])by[j.compte]=[];by[j.compte].push(j);});
  const filter=(UI.glFilter||'').toLowerCase().trim();
  const classFilter=UI.glClassFilter||'';
  const allAccs=Object.keys(by).sort();
  const filteredAccs=allAccs.filter(acc=>{
    if(filter&&!acc.toLowerCase().includes(filter)) return false;
    if(classFilter&&!acc.startsWith(classFilter)) return false;
    return true;
  });

  // Classes présentes
  const classesPresentes=[...new Set(allAccs.map(a=>a[0]))].filter(c=>'1234567'.includes(c)).sort();
  const classLabels={'1':'Cl.1 Fonds propres','2':'Cl.2 Immobilisations','3':'Cl.3 Stocks','4':'Cl.4 Tiers','5':'Cl.5 Trésorerie','6':'Cl.6 Charges','7':'Cl.7 Produits'};

  // Totalisation globale sur les comptes filtrés
  const totalD=filteredAccs.reduce((s,acc)=>s+by[acc].reduce((r,j)=>r+(+j.debit||0),0),0);
  const totalC=filteredAccs.reduce((s,acc)=>s+by[acc].reduce((r,j)=>r+(+j.credit||0),0),0);

  let lastClass='';
  const rows=filteredAccs.map(acc=>{
    const en=by[acc];
    const tD=en.reduce((s,j)=>s+(+j.debit||0),0);
    const tC=en.reduce((s,j)=>s+(+j.credit||0),0);
    const sol=tC-tD;
    const cls=acc[0]||'';
    let classBanner='';
    if(cls!==lastClass&&'1234567'.includes(cls)){
      lastClass=cls;
      const clsTotal=allAccs.filter(a=>a.startsWith(cls)).reduce((s,a)=>{
        const enC=by[a]||[];
        return s+enC.reduce((r,j)=>r+(+j.credit||0)-(+j.debit||0),0);
      },0);
      classBanner=`<div style="margin-top:16px;margin-bottom:6px;padding:6px 10px;background:var(--bg3,#f0f0f0);border-radius:6px;font-weight:600;font-size:12px;display:flex;justify-content:space-between;align-items:center">
        <span>${classLabels[cls]||('Classe '+cls)}</span>
        <span style="font-size:11px;font-weight:400;color:${clsTotal>=0?'#1e7e34':'var(--red)'}">Solde net : ${clsTotal>=0?'+':''}${clsTotal.toFixed(2)} €</span>
      </div>`;
    }
    return classBanner+`<div class="gl-acc">
    <div class="gl-hdr"><strong>${acc}</strong><span style="font-size:12px;color:${sol>=0?'#1e7e34':'var(--red)'}">Solde : ${sol>=0?'+':''}${sol.toFixed(2)} €</span></div>
    <div class="gl-row gl-head"><span>Date</span><span>Libellé / Pièce</span><span style="text-align:right">Débit</span><span style="text-align:right">Crédit</span><span style="text-align:right">Cumulé</span></div>
    ${(()=>{let s=0;return en.map(j=>{s+=(+j.credit||0)-(+j.debit||0);return`<div class="gl-row">
      <span style="font-size:11px">${fd(j.date_op)||'—'}</span>
      <span>${esc(j.libelle||'')}<br><span style="font-size:10px;color:var(--txt2)">${esc(j.piece||'')}</span></span>
      <span style="color:var(--red);text-align:right">${+j.debit>0?(+j.debit).toFixed(2)+' €':''}</span>
      <span style="color:#1e7e34;text-align:right">${+j.credit>0?(+j.credit).toFixed(2)+' €':''}</span>
      <span style="text-align:right;font-weight:500;color:${s>=0?'#1e7e34':'var(--red)'};">${s.toFixed(2)} €</span>
      </div>`;}).join('');})()}
    <div class="gl-row" style="background:var(--bg2);font-weight:500">
      <span></span><span>Totaux</span>
      <span style="color:var(--red);text-align:right">${tD.toFixed(2)} €</span>
      <span style="color:#1e7e34;text-align:right">${tC.toFixed(2)} €</span>
      <span style="text-align:right;color:${sol>=0?'#1e7e34':'var(--red)'}">${sol.toFixed(2)} €</span>
    </div>
    </div>`;
  }).join('');

  return`<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
    <input type="text" placeholder="🔍 Filtrer par compte..." value="${esc(UI.glFilter||'')}"
      oninput="UI.glFilter=this.value;UI.glClassFilter='';render()"
      style="padding:5px 10px;font-size:12px;border:1px solid var(--border);border-radius:6px;width:200px">
    <div style="display:flex;gap:4px;flex-wrap:wrap">
      <button class="btn sm ${!UI.glClassFilter?'primary':''}" onclick="UI.glClassFilter='';UI.glFilter='';render()">Tout</button>
      ${classesPresentes.map(c=>`<button class="btn sm ${UI.glClassFilter===c?'primary':''}" onclick="UI.glClassFilter='${c}';UI.glFilter='';render()" title="${classLabels[c]||''}">Cl.${c}</button>`).join('')}
    </div>
  </div>
  <button class="btn sm" onclick="exportGLCSV()">⬇ Export CSV</button>
  </div>
  <div style="font-size:11px;color:var(--txt2);margin-bottom:10px">
    ${filteredAccs.length} compte(s) affiché(s) · Total débit : ${totalD.toFixed(2)} € · Total crédit : ${totalC.toFixed(2)} € · Écart : <span style="color:${Math.abs(totalD-totalC)<0.01?'#1e7e34':'var(--red)'}">${(totalC-totalD).toFixed(2)} €</span>
  </div>
  ${rows}
  ${filteredAccs.length===0?`<div class="empty">Aucune écriture${filter||classFilter?' pour ce filtre':''}</div>`:''}`;
}
function sumJournal(regex,side){
  return jnlExo()
  .filter(j=>j.compte&&regex.test(j.compte))
  .reduce((s,j)=>s+(+(side==='credit'?j.credit:j.debit)||0),0);
}

function compteSolde(regex){
  return jnlExo()
  .filter(j=>j.compte&&regex.test(j.compte))
  .reduce((s,j)=>s+(+j.debit||0)-(+j.credit||0),0);
}

function totalClasse(prefixes,side){
  return jnlExo()
  .filter(j=>j.compte&&prefixes.some(prefix=>j.compte.startsWith(prefix)))
  .reduce((s,j)=>s+(+(side==='credit'?j.credit:j.debit)||0),0);
}

function journalDiagnostics(){
  const jnl=jnlExo();
  const totalDebit=jnl.reduce((s,j)=>s+(+j.debit||0),0);
  const totalCredit=jnl.reduce((s,j)=>s+(+j.credit||0),0);
  const ecartJournal=+(totalDebit-totalCredit).toFixed(2);
  const produits=totalClasse(['7'],'credit');
  const charges=totalClasse(['6'],'debit');
  const resultat=+(produits-charges).toFixed(2);
  const capitauxPropres=totalClasse(['10','12'],'credit')-totalClasse(['10','12'],'debit');
  const dettes=totalClasse(['16','40','42','43','44','45','46','47','48'],'credit')-totalClasse(['16','40','42','43','44','45','46','47','48'],'debit');
  const actifs=totalClasse(['20','21','23','26','27','28','29','37','38','39','41','46','47','48','50','51','52','53','54','55','58'],'debit')-totalClasse(['20','21','23','26','27','28','29','37','38','39','41','46','47','48','50','51','52','53','54','55','58'],'credit');
  const ecartBilan=+(actifs-(Math.max(0,capitauxPropres)+Math.max(0,dettes)+Math.abs(resultat))).toFixed(2);
  return{totalDebit,totalCredit,ecartJournal,produits,charges,resultat,actifs,capitauxPropres,dettes,ecartBilan};
}

function calcBilan(){
  const diag=journalDiagnostics();
  const banques=Math.max(0,compteSolde(/^512/));
  const caisse=Math.max(0,compteSolde(/^530/));
  const creancesAdherents=Math.max(0,compteSolde(/^411/));
  const immobilisations=Math.max(0,compteSolde(/^2/));
  const chargesAvance=Math.max(0,compteSolde(/^481/));
  const autresActifs=Math.max(0,compteSolde(/^47/));

  const fournisseurs=Math.max(0,-compteSolde(/^401/));
  const dettesSociales=Math.max(0,-compteSolde(/^43/));
  const comptesAttentePassif=Math.max(0,-compteSolde(/^47/));
  const produitsConstates=Math.max(0,-compteSolde(/^487/));
  const emprunts=Math.max(0,-compteSolde(/^164/));
  const fondsAssociatifs=Math.max(0,sumJournal(/^(10|12)/, 'credit')-sumJournal(/^(10|12)/, 'debit'));

  const cotisations=sumJournal(/^756/, 'credit');
  const subventions=sumJournal(/^74/, 'credit')+sumJournal(/^751/, 'credit');
  const autresProduits=sumJournal(/^70/, 'credit')+sumJournal(/^708/, 'credit')+sumJournal(/^75(?!6|1)/, 'credit')+sumJournal(/^758/, 'credit');
  const produits=diag.produits;
  const charges=diag.charges;
  const resultat=diag.resultat;

  const actifRows=[
    {label:'2150/2180 - Immobilisations',value:immobilisations},
    {label:'4110 - Créances adhérents et clients',value:creancesAdherents},
    {label:'4710 - Comptes d attente débiteurs',value:Math.max(0,autresActifs)},
    {label:'4810 - Charges constatées d avance',value:chargesAvance},
    {label:'5120 - Banque',value:banques},
    {label:'5300 - Caisse',value:caisse},
  ];
  const passifRows=[
    {label:'1010/1020/1060 - Fonds associatifs et réserves',value:fondsAssociatifs},
    {label:'1640 - Emprunts',value:emprunts},
    {label:'4010 - Fournisseurs',value:fournisseurs},
    {label:'4310 - Dettes sociales',value:dettesSociales},
    {label:'4710 - Comptes d attente créditeurs',value:comptesAttentePassif},
    {label:'4870 - Produits constatés d avance',value:produitsConstates},
    {label:`${resultat>=0?'1200':'1290'} - Résultat de l exercice`,value:Math.abs(resultat),signed:resultat},
  ];
  const totalActif=actifRows.reduce((s,r)=>s+Math.max(0,r.value),0);
  const totalPassif=passifRows.reduce((s,r)=>s+Math.max(0,r.value),0);
  return{actifRows,passifRows,totalActif,totalPassif,banques,caisse,creancesAdherents,immobilisations,cotisations,subventions,autresProduits,charges,produits,resultat,ecartJournal:diag.ecartJournal,ecartBilan:diag.ecartBilan};
}

function vBilan(){
  const {actifRows,passifRows,totalActif,totalPassif,cotisations,subventions,autresProduits,charges,produits,resultat,ecartJournal,ecartBilan}=calcBilan();
  const exL=D.currentExo?.libelle||'Exercice actif';
  const dateEdition=new Date().toLocaleDateString('fr-FR');
  return`<div class="bilan-shell">
  <div class="view-head">
  <div>
  <div class="eyebrow">Publication comptable</div>
  <h2>Bilan final</h2>
  <p>Présentation revue pour une lecture officielle, avec hiérarchie visuelle plus nette, colonnes équilibrées et contrôles de cohérence clairement identifiés.</p>
  </div>
  </div>
  <div class="bilan-toolbar">
  <div class="bilan-meta">
  ${D.currentExo?`<span class="badge bblue">${exL}</span>`:''}
  <span class="badge bgray">Édité le ${dateEdition}</span>
  </div>
  <button class="btn green" onclick="printBilan()">🖨 Imprimer le bilan</button>
  </div>
  <section class="bilan-board">
  <div class="bilan-board-head">
  <div>
  <div class="bilan-board-title">Bilan comptable de clôture</div>
  <div class="bilan-board-sub">Document de synthèse de l'actif et du passif établi à partir des écritures de l'exercice sélectionné. Les totaux ci-dessous peuvent être repris dans une communication institutionnelle ou une annexe diffusée au bureau et aux adhérents.</div>
  </div>
  <div class="bilan-stamp">
  <div class="bilan-stamp-label">Exercice concerné</div>
  <div class="bilan-stamp-value">${exL}</div>
  </div>
  </div>
  <div class="bilan-summary">
  <div class="bilan-stat"><div class="bilan-stat-label">Produits</div><div class="bilan-stat-value" style="color:#1e7e34">${produits.toFixed(2)} €</div></div>
  <div class="bilan-stat"><div class="bilan-stat-label">Charges</div><div class="bilan-stat-value" style="color:var(--red)">${charges.toFixed(2)} €</div></div>
  <div class="bilan-stat"><div class="bilan-stat-label">Cotisations</div><div class="bilan-stat-value">${cotisations.toFixed(2)} €</div></div>
  <div class="bilan-stat"><div class="bilan-stat-label">Subventions</div><div class="bilan-stat-value">${subventions.toFixed(2)} €</div></div>
  </div>
  <div class="bilan-grid">
  <section class="bilan-panel">
  <div class="bilan-panel-head">
  <div><h3>Actif</h3><p>Emplois durables, créances et trésorerie disponible.</p></div>
  <span class="badge bgray">Total ${totalActif.toFixed(2)} €</span>
  </div>
  <table class="bilan-table"><tbody>
  ${actifRows.map(r=>`<tr><td class="label">${r.label}</td><td class="amount">${Math.max(0,r.value).toFixed(2)} €</td></tr>`).join('')}
  <tr class="total"><td class="label">Total actif</td><td class="amount">${totalActif.toFixed(2)} €</td></tr>
  </tbody></table>
  </section>
  <section class="bilan-panel">
  <div class="bilan-panel-head">
  <div><h3>Passif</h3><p>Fonds associatifs, dettes et résultat de clôture.</p></div>
  <span class="badge bgray">Total ${totalPassif.toFixed(2)} €</span>
  </div>
  <table class="bilan-table"><tbody>
  ${passifRows.map(r=>`<tr class="${typeof r.signed==='number'?'is-result':''}"><td class="label" style="${typeof r.signed==='number'?`color:${r.signed>=0?'#1e7e34':'var(--red)'}`:''}">${r.label}</td><td class="amount" style="${typeof r.signed==='number'?`color:${r.signed>=0?'#1e7e34':'var(--red)'}`:''}">${(r.value||0).toFixed(2)} €</td></tr>`).join('')}
  <tr class="total"><td class="label">Total passif</td><td class="amount">${totalPassif.toFixed(2)} €</td></tr>
  </tbody></table>
  </section>
  </div>
  <div class="bilan-notes">
  <div class="bilan-note">
  <h4>Composition des produits</h4>
  <div class="bilan-kv"><span>Cotisations</span><strong>${cotisations.toFixed(2)} €</strong></div>
  <div class="bilan-kv"><span>Subventions</span><strong>${subventions.toFixed(2)} €</strong></div>
  <div class="bilan-kv"><span>Autres produits</span><strong>${autresProduits.toFixed(2)} €</strong></div>
  </div>
  <div class="bilan-note">
  <h4>Lecture</h4>
  <p style="font-size:12px;color:var(--txt2);line-height:1.7">Le résultat de l'exercice est intégré au passif. Les classes 2, 4 et 5 structurent principalement l'actif, tandis que les capitaux associatifs et dettes constituent le passif présenté.</p>
  </div>
  <div class="bilan-note">
  <h4>Contrôle</h4>
  <div class="bilan-kv ${ecartJournal===0?'ok':'alert'}"><span>Journal débit - crédit</span><strong>${ecartJournal.toFixed(2)} €</strong></div>
  <div class="bilan-kv ${ecartBilan===0?'ok':'alert'}"><span>Actif - passif</span><strong>${ecartBilan.toFixed(2)} €</strong></div>
  </div>
  </div>
  <div class="bilan-footer">
  <div class="bilan-footer-text">Version de présentation destinée à une diffusion officielle. Les montants sont issus des écritures de l'exercice actif et le cadrage ci-dessus permet une relecture rapide avant export papier ou PDF.</div>
  <div class="bilan-result-chip">
  <span>Résultat net</span>
  <strong style="color:${resultat>=0?'#1e7e34':'var(--red)'}">${resultat>=0?'+':''}${resultat.toFixed(2)} €</strong>
  </div>
  </div>
  </section>
  </div>`;
}

function printBilan(){
  const {actifRows,passifRows,totalActif,totalPassif,charges,produits,resultat,cotisations,subventions,autresProduits,ecartJournal,ecartBilan}=calcBilan();
  const ci=D.clubInfo||{};
  const exL=D.currentExo?.libelle||'';
  const logo=D.logoUrl?`<img src="${D.logoUrl}" style="width:66px;height:66px;object-fit:contain;border-radius:50%;border:1px solid #cdbd9f;padding:6px;background:#fff">` :`<span style="font-size:40px">🥊</span>`;
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bilan ${exL}</title>
  <style>
  body{font-family:"Georgia","Times New Roman",serif;margin:0;color:#1f1a17;font-size:12.5px;background:#fff}
  .page{padding:18mm 16mm 16mm}
  .hdr{display:flex;align-items:flex-start;gap:16px;padding-bottom:14px;border-bottom:1.5px solid #2b211b}
  .club{display:flex;flex-direction:column;gap:3px}
  .club h1{font-size:18px;font-weight:700;letter-spacing:.01em;margin:0}
  .club p{margin:0;font-size:11px;color:#5f554d;line-height:1.55}
  .doc{margin-left:auto;text-align:right}
  .doc .k{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#7b7067}
  .doc .v{font-size:20px;font-weight:700;margin-top:4px}
  .doc .s{font-size:11px;color:#5f554d;margin-top:5px;line-height:1.5}
  .intro{margin:14px 0 12px;font-size:11px;color:#5f554d;line-height:1.7}
  .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 0 14px}
  .stat{border:1px solid #d8cec3;padding:9px 10px;border-radius:10px;background:#faf7f2}
  .stat .l{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#7b7067}
  .stat .v{font-size:16px;font-weight:700;margin-top:4px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .panel{border:1px solid #d8cec3;border-radius:12px;overflow:hidden}
  .panel-h{padding:10px 12px;border-bottom:1px solid #d8cec3;background:#f6f1ea}
  .panel-h h2{font-size:12px;font-weight:700;margin:0;text-transform:uppercase;letter-spacing:.08em}
  .panel-h p{margin:4px 0 0;font-size:10px;color:#6c6158}
  table{width:100%;border-collapse:collapse}
  td{padding:8px 12px;border-bottom:.7px solid #ece3d8;vertical-align:top}
  td:last-child{text-align:right;font-weight:700;white-space:nowrap}
  .tot td{font-weight:700;border-top:1.2px solid #2b211b;border-bottom:none;background:#faf7f2}
  .notes{display:grid;grid-template-columns:1.15fr 1fr 1fr;gap:10px;margin-top:14px}
  .note{border:1px solid #d8cec3;border-radius:12px;padding:10px 12px}
  .note h3{margin:0 0 8px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#7b7067}
  .kv{display:flex;justify-content:space-between;gap:10px;padding:4px 0;font-size:11px;border-bottom:.7px dashed #ddd1c6}
  .kv:last-child{border-bottom:none}
  .kv strong{font-weight:700}
  .footer{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-top:14px;padding-top:12px;border-top:1px solid #d8cec3}
  .footer p{margin:0;max-width:66%;font-size:10px;color:#6c6158;line-height:1.7}
  .result{border:1px solid #d8cec3;border-radius:10px;padding:10px 12px;min-width:220px;background:#faf7f2}
  .result .l{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#7b7067}
  .result .v{font-size:20px;font-weight:700;margin-top:4px}
  .sign{margin-top:18px;display:grid;grid-template-columns:1fr 1fr;gap:24px}
  .sign-box{padding-top:24px;border-top:1px solid #cdbd9f;font-size:10px;color:#6c6158;text-transform:uppercase;letter-spacing:.08em}
  @media print{@page{size:A4;margin:0}}
  </style></head>
  <body>
  <div class="page">
  <div class="hdr">
  ${logo}
  <div class="club">
  <h1>${ci.nom||'AFFBC'}</h1>
  <p>${ci.adresse||''}</p>
  </div>
  <div class="doc">
  <div class="k">Document officiel</div>
  <div class="v">Bilan comptable</div>
  <div class="s">${exL}<br>Édité le ${new Date().toLocaleDateString('fr-FR')}</div>
  </div>
  </div>
  <p class="intro">État de synthèse présentant la situation patrimoniale de l'association à la clôture de l'exercice. Les montants ci-dessous sont issus des écritures comptables enregistrées dans le journal de l'exercice actif.</p>
  <div class="summary">
  <div class="stat"><div class="l">Produits</div><div class="v" style="color:#1e7e34">${produits.toFixed(2)} €</div></div>
  <div class="stat"><div class="l">Charges</div><div class="v" style="color:#b33627">${charges.toFixed(2)} €</div></div>
  <div class="stat"><div class="l">Cotisations</div><div class="v">${cotisations.toFixed(2)} €</div></div>
  <div class="stat"><div class="l">Subventions</div><div class="v">${subventions.toFixed(2)} €</div></div>
  </div>
  <div class="grid">
  <div class="panel"><div class="panel-h"><h2>Actif</h2><p>Immobilisations, créances et disponibilités.</p></div><table>
  ${actifRows.map(r=>`<tr><td>${r.label}</td><td>${Math.max(0,r.value).toFixed(2)} €</td></tr>`).join('')}
  <tr class="tot"><td>Total actif</td><td>${totalActif.toFixed(2)} €</td></tr>
  </table></div>
  <div class="panel"><div class="panel-h"><h2>Passif</h2><p>Fonds associatifs, dettes et résultat.</p></div><table>
  ${passifRows.map(r=>`<tr><td style="${typeof r.signed==='number'?`color:${r.signed>=0?'#1e7e34':'#b33627'}`:''}">${r.label}</td><td style="${typeof r.signed==='number'?`color:${r.signed>=0?'#1e7e34':'#b33627'}`:''}">${(r.value||0).toFixed(2)} €</td></tr>`).join('')}
  <tr class="tot"><td>Total passif</td><td>${totalPassif.toFixed(2)} €</td></tr>
  </table></div>
  </div>
  <div class="notes">
  <div class="note">
  <h3>Composition des produits</h3>
  <div class="kv"><span>Cotisations</span><strong>${cotisations.toFixed(2)} €</strong></div>
  <div class="kv"><span>Subventions</span><strong>${subventions.toFixed(2)} €</strong></div>
  <div class="kv"><span>Autres produits</span><strong>${autresProduits.toFixed(2)} €</strong></div>
  </div>
  <div class="note">
  <h3>Contrôle technique</h3>
  <div class="kv"><span>Journal débit - crédit</span><strong style="color:${ecartJournal===0?'#1e7e34':'#b33627'}">${ecartJournal.toFixed(2)} €</strong></div>
  <div class="kv"><span>Actif - passif</span><strong style="color:${ecartBilan===0?'#1e7e34':'#b33627'}">${ecartBilan.toFixed(2)} €</strong></div>
  </div>
  <div class="note">
  <h3>Informations de clôture</h3>
  <div class="kv"><span>Total produits</span><strong>${produits.toFixed(2)} €</strong></div>
  <div class="kv"><span>Total charges</span><strong>${charges.toFixed(2)} €</strong></div>
  <div class="kv"><span>Association</span><strong>${ci.nom||'AFFBC'}</strong></div>
  </div>
  </div>
  <div class="footer">
  <p>${ci.nom||'AFFBC'} — Association loi 1901. Document généré pour diffusion interne ou présentation officielle après validation du bureau.</p>
  <div class="result"><div class="l">Résultat net de l'exercice</div><div class="v" style="color:${resultat>=0?'#1e7e34':'#b33627'}">${resultat>=0?'+':''}${resultat.toFixed(2)} €</div></div>
  </div>
  <div class="sign">
  <div class="sign-box">Visa trésorerie</div>
  <div class="sign-box">Validation présidence</div>
  </div>
  </div>
  <script>setTimeout(()=>window.print(),300);<\/script></body></html>`);
  w.document.close();
}

function vResultat(){
  const jnl=jnlExo();
  const prod=jnl.filter(j=>+j.credit>0&&j.compte&&j.compte.match(/^7/));
  const charg=jnl.filter(j=>+j.debit>0&&j.compte&&j.compte.match(/^6/));
  const tP=prod.reduce((s,j)=>s+(+j.credit),0),tC=charg.reduce((s,j)=>s+(+j.debit),0);
  return`<div class="g2">
  <div><p class="stit">Produits (classe 7)</p>
  ${prod.map(j=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:.5px solid var(--brd);font-size:12.5px"><span>${j.libelle}</span><span style="color:#1e7e34">${(+j.credit).toFixed(2)} €</span></div>`).join('')}
  <div style="display:flex;justify-content:space-between;padding:7px 0;font-weight:500"><span>Total</span><span style="color:#1e7e34">${tP.toFixed(2)} €</span></div>
  </div>
  <div><p class="stit">Charges (classe 6)</p>
  ${charg.map(j=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:.5px solid var(--brd);font-size:12.5px"><span>${j.libelle}</span><span style="color:var(--red)">${(+j.debit).toFixed(2)} €</span></div>`).join('')}
  <div style="display:flex;justify-content:space-between;padding:7px 0;font-weight:500"><span>Total</span><span style="color:var(--red)">${tC.toFixed(2)} €</span></div>
  </div>
  </div>
  <div style="margin-top:14px;padding:14px;background:var(--bg2);border-radius:var(--r);display:flex;justify-content:space-between;align-items:center">
  <strong style="font-weight:500">Résultat de l'exercice</strong>
  <strong style="font-size:20px;font-weight:500;color:${tP-tC>=0?'#1e7e34':'var(--red)'}">${tP-tC>=0?'+':''}${(tP-tC).toFixed(2)} €</strong>
  </div>`;
}

function vExercices(){
  const canWrite=hasPerm('perm_comptabilite','write');
  return`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
  <strong>Exercices comptables</strong>
  ${canWrite?`<button class="btn primary" onclick="openModal('exo')">+ Nouvel exercice</button>`:''}
  </div>
  <div class="wrap"><table>
  <thead><tr><th>Libellé</th><th>Début</th><th>Fin</th><th>Écritures</th><th>Statut</th><th></th></tr></thead>
  <tbody>${D.exercices.map(e=>{
    const nb=D.journal.filter(j=>j.exercice_id===e.id).length;
    return`<tr>
    <td><strong style="font-weight:500">${e.libelle}</strong></td>
    <td>${fd(e.date_debut)}</td><td>${fd(e.date_fin)}</td>
    <td>${nb}</td>
    <td><span class="badge ${e.statut==='actif'?'bok':e.statut==='cloture'?'bwarn':'barch'}">${e.statut==='actif'?'Actif':e.statut==='cloture'?'Clôturé':'Archivé'}</span></td>
    <td style="white-space:nowrap">
    ${canWrite&&e.statut==='actif'?`<button class="btn sm" onclick="setExoActif('${e.id}')">Sélectionner</button>`:''}
    ${e.id===D.currentExo?.id?`<span class="badge bok" style="margin-left:4px">✓ En cours</span>`:''}
    ${canWrite&&e.statut==='actif'?`<button class="btn sm gold" style="margin-left:4px" onclick="openModal('exo_close','${e.id}')">Clôturer</button>`:''}
    ${canWrite&&e.statut!=='archive'&&e.id!==D.currentExo?.id?`<button class="btn sm danger" style="margin-left:4px" onclick="archiverExo('${e.id}')">Archiver</button>`:''}
    </td>
    </tr>`;
  }).join('')}
  ${D.exercices.length===0?`<tr><td colspan="6" class="empty">Aucun exercice</td></tr>`:''}
  </tbody>
  </table></div>`;
}

async function setExoActif(id){
  if(!requireWritePerm('perm_comptabilite')) return;
  D.currentExo=D.exercices.find(e=>e.id===id)||null;
  document.getElementById('exo-badge').textContent=D.currentExo?.libelle||'Aucun exercice actif';
  render();
}
async function archiverExo(id){
  if(!requireWritePerm('perm_comptabilite')) return;
  if(!confirm('Archiver cet exercice ? Il ne pourra plus recevoir de nouvelles écritures.'))return;
  const {error}=await SB.from('exercices').update({statut:'archive'}).eq('id',id);
  if(error) return alert('Erreur : '+error.message);
  D.exercices=D.exercices.map(e=>e.id===id?{...e,statut:'archive'}:e);
  refreshCurrentExo();
  render();
}

// ═══════════════════════════════════════════════════
// ACHATS
// ═══════════════════════════════════════════════════
function vAchatBudget(){
  const cats=[...new Set(D.achats.map(a=>a.categorie).filter(Boolean))].sort();
  const totalByCat={};
  D.achats.filter(a=>a.statut==='paye'||a.statut==='valide').forEach(a=>{
    if(!a.categorie) return;
    totalByCat[a.categorie]=(totalByCat[a.categorie]||0)+(+a.montant||0);
  });
  const budgets=UI.budgetCats||{};
  return`<div class="card" style="margin-bottom:18px">
  <p style="font-weight:600;margin-bottom:12px">💰 Budgets prévisionnels par catégorie</p>
  <p style="font-size:12px;color:var(--txt2);margin-bottom:12px">Définissez un plafond par catégorie. Une alerte apparaît si les dépenses dépassent 80% du budget.</p>
  <table>
  <thead><tr><th>Catégorie</th><th>Dépensé</th><th>Budget prévisionnel</th><th>Consommé</th><th></th></tr></thead>
  <tbody>
  ${cats.map(cat=>{
    const spent=totalByCat[cat]||0;
    const budget=+(budgets[cat]||0);
    const pct=budget>0?Math.round(spent/budget*100):null;
    const alert=pct!==null&&pct>=80;
    return`<tr>
    <td><span class="badge bgray">${esc(cat)}</span></td>
    <td><strong style="color:${alert?'var(--red)':'inherit'}">${spent.toFixed(2)} €</strong></td>
    <td><input type="number" min="0" step="10" value="${budget||''}" placeholder="Illimité"
      style="width:120px;padding:4px 8px;border:1px solid var(--brd);border-radius:6px"
      onchange="UI.budgetCats['${esc(cat)}']=+this.value;render()"></td>
    <td>${budget>0?`<div style="display:flex;align-items:center;gap:6px">
      <div style="flex:1;height:8px;background:var(--bg2);border-radius:4px;min-width:80px">
        <div style="width:${Math.min(pct,100)}%;height:100%;background:${pct>=100?'var(--red)':pct>=80?'var(--gold)':'#1e7e34'};border-radius:4px"></div>
      </div>
      <span style="font-size:11px;font-weight:600;color:${pct>=100?'var(--red)':pct>=80?'var(--gold)':'inherit'}">${pct}%</span>
      ${alert?`<span title="${pct>=100?'Budget dépassé !':'Attention : 80% du budget atteint'}" style="font-size:14px">${pct>=100?'🚨':'⚠️'}</span>`:''}
      </div>`:'<span style="font-size:11px;color:var(--txt2)">Pas de limite</span>'}
    </td>
    <td>${budget>0&&pct>=100?`<span class="badge bno">Dépassé</span>`:budget>0&&pct>=80?`<span class="badge bwarn">Alerte</span>`:budget>0?`<span class="badge bok">OK</span>`:''}</td>
    </tr>`;
  }).join('')}
  ${cats.length===0?`<tr><td colspan="5" class="empty">Aucune catégorie d'achat enregistrée</td></tr>`:''}
  </tbody>
  </table>
  </div>`;
}

function vAchat(){
  const canWrite=hasPerm('perm_achats','write');
  const st=UI.subTab?.achat||'liste';
  if(st==='budget') return`<div class="view-head"><div><div class="eyebrow">Achats</div><h2>Budgets</h2></div>
  <div style="display:flex;gap:8px">
  <button class="btn ${st==='liste'?'primary':''}" onclick="showST('achat','liste')">Liste</button>
  <button class="btn ${st==='budget'?'primary':''}" onclick="showST('achat','budget')">Budgets</button>
  </div></div>${vAchatBudget()}`;
  const filtered=D.achats.filter(a=>{
    const matchesSearch=(a.fournisseur+' '+(a.designation||'')).toLowerCase().includes((UI.search.achats||'').toLowerCase());
    const matchesStatus=achatMatchesFilter(a,UI.achatFilterStatus);
    const matchesCat=!(UI.achatFilterCat||'') || a.categorie===UI.achatFilterCat;
    const dateFrom=UI.achatFilterDateFrom||'';
    const dateTo=UI.achatFilterDateTo||'';
    const dateOp=a.date_op||'';
    const matchesDateFrom=!dateFrom||dateOp>=dateFrom;
    const matchesDateTo=!dateTo||dateOp<=dateTo;
    return matchesSearch && matchesStatus && matchesCat && matchesDateFrom && matchesDateTo;
  });
  const {rows:f,totalPages}=paginateList(filtered,'achats');
  const tP=D.achats.filter(a=>a.statut==='paye').reduce((s,a)=>s+(+a.montant),0);
  const en=D.achats.filter(a=>a.statut==='nouveau'||a.statut==='valide').reduce((s,a)=>s+(+a.montant),0);
  return`<div class="view-head">
  <div>
  <div class="eyebrow">Fournisseurs et dépenses</div>
  <h2>Achats</h2>
  <p>Suivez les validations, les modes de paiement et les justificatifs sans perdre le fil des montants engagés.</p>
  </div>
  <div style="display:flex;gap:8px">
  <button class="btn ${st==='liste'||!st?'primary':''}" onclick="showST('achat','liste')">Liste</button>
  <button class="btn ${st==='budget'?'primary':''}" onclick="showST('achat','budget')">💰 Budgets</button>
  </div>
  </div>
  <div class="g4" style="margin-bottom:14px">
  <div class="sc"><div class="v vr">${filtered.length}</div><div class="l">Achats</div></div>
  <div class="sc"><div class="v vgo">${tP.toLocaleString('fr-FR')} €</div><div class="l">Total réglé</div></div>
  <div class="sc"><div class="v">${en.toLocaleString('fr-FR')} €</div><div class="l">En cours</div></div>
  <div class="sc"><div class="v">${D.achats.filter(a=>a.statut==='nouveau').length}</div><div class="l">À valider</div></div>
  </div>
  <div class="toolbar">
  <input style="flex:1;min-width:160px" placeholder="Rechercher..." value="${UI.search.achats||''}" oninput="UI.search.achats=this.value;render()">
  <select style="width:auto;min-width:180px" onchange="UI.achatFilterStatus=this.value;render()">
  <option value="" ${!UI.achatFilterStatus?'selected':''}>Tous les statuts</option>
  <option value="pending" ${UI.achatFilterStatus==='pending'?'selected':''}>En attente</option>
  <option value="nouveau" ${UI.achatFilterStatus==='nouveau'?'selected':''}>Nouveaux</option>
  <option value="valide" ${UI.achatFilterStatus==='valide'?'selected':''}>Validés</option>
  <option value="paye" ${UI.achatFilterStatus==='paye'?'selected':''}>Payés</option>
  <option value="refuse" ${UI.achatFilterStatus==='refuse'?'selected':''}>Refusés</option>
  </select>
  <select style="width:auto;min-width:180px" onchange="UI.achatFilterCat=this.value;render()">
  <option value="" ${!(UI.achatFilterCat||'')?'selected':''}>Toutes les catégories</option>
  ${[...new Set(D.achats.map(a=>a.categorie).filter(Boolean))].sort().map(cat=>`<option value="${esc(cat)}" ${UI.achatFilterCat===cat?'selected':''}>${esc(cat)}</option>`).join('')}
  </select>
  ${canWrite?`<button class="btn primary" onclick="openModal('achat')">+ Nouvel achat</button>`:''}
  <button class="btn" onclick="exportAchatsCSV()">⬇ Export CSV</button>
  <input type="date" title="Du" value="${UI.achatFilterDateFrom||''}" style="width:auto" onchange="UI.achatFilterDateFrom=this.value;render()">
  <input type="date" title="Au" value="${UI.achatFilterDateTo||''}" style="width:auto" onchange="UI.achatFilterDateTo=this.value;render()">
  <button class="btn" onclick="UI.search.achats='';UI.achatFilterStatus='';UI.achatFilterCat='';UI.achatFilterDateFrom='';UI.achatFilterDateTo='';render()">Réinitialiser</button>
  </div>
  <div class="wrap"><table>
  <thead><tr><th>Date</th><th>Fournisseur</th><th>Désignation</th><th>Catégorie</th><th>Montant</th><th>Mode paiement</th><th>Référence</th><th>Pièce</th><th>PDF</th><th>Statut</th><th></th></tr></thead>
  <tbody>${f.map(a=>`<tr>
    <td>${fd(a.date_op)}</td>
    <td><strong style="font-weight:500">${a.fournisseur}</strong></td>
    <td>${a.designation||''}</td>
    <td><span class="badge bgray">${a.categorie}</span></td>
    <td><strong style="font-weight:500">${(+a.montant).toFixed(2)} €</strong></td>
    <td style="font-size:11px">${a.mode_paiement||'—'}</td>
    <td style="font-size:11px;color:var(--txt2)">${a.reference_paiement||'—'}</td>
    <td style="font-size:11px;color:var(--txt2)">${a.piece||'—'}</td>
    <td style="white-space:nowrap">
    ${a.pdf_public_url?`<a class="btn sm" href="${a.pdf_public_url}" target="_blank">Voir</a>`:`<span class="badge bgray">Aucun</span>`}
    </td>
    <td><span class="badge ${a.statut==='paye'?'bok':a.statut==='valide'?'bblue':a.statut==='refuse'?'bno':'bwarn'}">${a.statut==='nouveau'?'Nouveau':a.statut==='valide'?'Validé':a.statut==='refuse'?'Refusé':'Payé'}</span></td>
    <td style="white-space:nowrap">
    ${canWrite?`<button class="btn sm" onclick="openModal('achat','${a.id}')">Modifier</button>
    ${a.statut==='nouveau'?`<button class="btn sm" style="margin-left:4px" onclick="validerAchat('${a.id}')">Valider</button>`:''}
    <button class="btn sm" style="margin-left:4px" onclick="trigPDF('achats','${a.id}')">${a.pdf_public_url?'Remplacer PDF':'Ajouter PDF'}</button>
    <button class="btn sm danger" style="margin-left:4px" onclick="delAchat('${a.id}')">✕</button>`:''}
    </td>
    </tr>`).join('')}
    ${f.length===0?`<tr><td colspan="11" class="empty">Aucun achat</td></tr>`:''}
    </tbody>
    </table></div>
    ${renderPager('achats',totalPages)}`;
}

// ═══════════════════════════════════════════════════
// FACTURATION
// ═══════════════════════════════════════════════════
function vFacture(){
  const canWrite=hasPerm('perm_facturation','write');
  const sub=UI.subTab.facture;
  return`<div class="view-head">
  <div>
  <div class="eyebrow">Produits et encaissements</div>
  <h2>Ventes</h2>
  <p>Enregistrez les ventes du club, éditez un document commercial et alimentez automatiquement les écritures de produits en comptabilité.</p>
  </div>
  </div>
  <div class="stabs">
  <button class="stab ${sub==='liste'?'active':''}" onclick="showST('facture','liste')">Liste des ventes</button>
  ${canWrite?`<button class="stab ${sub==='edit'?'active':''}" onclick="nouvFac()">+ Nouvelle vente</button>`:''}
  <button class="stab ${sub==='dons'?'active':''}" onclick="showST('facture','dons')">Reçus de dons</button>
  </div>
  ${sub==='liste'?vFacListe():sub==='dons'?vDonListe():vFacEditor()}`;
}

function vFacListe(){
  const canWrite=hasPerm('perm_facturation','write');
  const ventesRaw=D.factures.filter(f=>!isDonationReceipt(f)).map(f=>({...f,statut:normalizeFactureStatus(f.statut,f.date_op)}));
  const tPayee=ventesRaw.filter(f=>f.statut==='Payée').reduce((s,f)=>s+(f.lignes||[]).reduce((t,l)=>t+(+l.qte||0)*(+l.pu||0),0),0);
  const tOuverte=ventesRaw.filter(f=>f.statut==='Émise'||f.statut==='En retard').reduce((s,f)=>s+(f.lignes||[]).reduce((t,l)=>t+(+l.qte||0)*(+l.pu||0),0),0);
  const tTotal=ventesRaw.reduce((s,f)=>s+(f.lignes||[]).reduce((t,l)=>t+(+l.qte||0)*(+l.pu||0),0),0);
  const statsHtml=`<div class="g4" style="margin-bottom:14px">
  <div class="sc"><div class="v vg">${ventesRaw.length}</div><div class="l">Ventes</div></div>
  <div class="sc"><div class="v vgo">${tTotal.toLocaleString('fr-FR',{minimumFractionDigits:2})} €</div><div class="l">Total facturé</div></div>
  <div class="sc"><div class="v vg">${tPayee.toLocaleString('fr-FR',{minimumFractionDigits:2})} €</div><div class="l">Encaissé</div></div>
  <div class="sc"><div class="v vr">${tOuverte.toLocaleString('fr-FR',{minimumFractionDigits:2})} €</div><div class="l">En attente</div></div>
  </div>`;
  const ventesRawSorted=[...ventesRaw].sort((a,b)=>{
    const toISO=d=>{if(!d)return'';const p=d.split('/');return p.length===3?`${p[2]}-${p[1]}-${p[0]}`:d;};
    return toISO(b.date_op).localeCompare(toISO(a.date_op));
  });
  const filtered=ventesRawSorted.filter(f=>{
    const haystack=`${f.numero||''} ${f.destinataire||''} ${f.objet||''}`.toLowerCase();
    const matchesSearch=haystack.includes((UI.search.factures||'').toLowerCase());
    const matchesStatus=factureMatchesFilter(f,UI.factureFilterStatus);
    return matchesSearch && matchesStatus;
  });
  const {rows:ventes,totalPages}=paginateList(filtered,'factures');
  return`<div>
  ${statsHtml}
  <div class="toolbar">
  <input style="flex:1;min-width:180px" placeholder="Rechercher une vente..." value="${UI.search.factures||''}" oninput="UI.search.factures=this.value;render()">
  <select style="width:auto;min-width:180px" onchange="UI.factureFilterStatus=this.value;render()">
  <option value="" ${!UI.factureFilterStatus?'selected':''}>Tous les statuts</option>
  <option value="open" ${UI.factureFilterStatus==='open'?'selected':''}>Ouvertes</option>
  <option value="Émise" ${UI.factureFilterStatus==='Émise'?'selected':''}>Émises</option>
  <option value="En retard" ${UI.factureFilterStatus==='En retard'?'selected':''}>En retard</option>
  <option value="Payée" ${UI.factureFilterStatus==='Payée'?'selected':''}>Payées</option>
  <option value="Brouillon" ${UI.factureFilterStatus==='Brouillon'?'selected':''}>Brouillons</option>
  <option value="Annulée" ${UI.factureFilterStatus==='Annulée'?'selected':''}>Annulées</option>
  </select>
  ${canWrite?`<button class="btn primary" onclick="nouvFac()">+ Nouvelle vente</button>`:''}
  <button class="btn" onclick="UI.search.factures='';UI.factureFilterStatus='';render()">Réinitialiser</button>
  </div>
  <div class="wrap"><table>
  <thead><tr><th>N° vente</th><th>Date</th><th>Client / destinataire</th><th>Objet</th><th>Total</th><th>Statut</th><th></th></tr></thead>
  <tbody>${ventes.map(f=>{
    const tot=(f.lignes||[]).reduce((s,l)=>s+(+l.qte||0)*(+l.pu||0),0);
    return`<tr>
    <td><strong style="font-weight:500">${f.numero}</strong></td>
    <td>${fd(f.date_op)}</td><td>${f.destinataire||''}</td><td>${f.objet||''}</td>
    <td><strong>${tot.toFixed(2)} €</strong></td>
    <td><span class="badge ${factureStatusBadge(f.statut)}">${f.statut}</span>${f.statut==='Payée'&&f.date_paiement?`<br><span style="font-size:10px;color:var(--txt2)">le ${fd(f.date_paiement)}</span>`:''}</td>
    <td style="white-space:nowrap">
    <button class="btn sm" onclick="printFac('${f.id}')">🖨 Imprimer</button>
    ${f.client_email?`<button class="btn sm" style="margin-left:4px" onclick="sendFactureEmail('${f.id}')" title="Envoyer le document par email à ${esc(f.client_email)}">📧 Envoyer</button>`:''}
    ${canWrite&&(f.statut==='En retard'||f.statut==='Émise'||f.statut==='En attente')&&f.client_email?`<button class="btn sm bwarn" style="margin-left:4px" onclick="relanceFactureEmail('${f.id}')" title="Envoyer une relance par email">↻ Relance</button>`:''}
    ${canWrite&&f.statut!=='Payée'?`<button class="btn sm" style="margin-left:4px" onclick="setFactureStatus('${f.id}','Payée')">Payée</button>`:''}
    ${canWrite&&f.statut!=='En retard'?`<button class="btn sm gold" style="margin-left:4px" onclick="setFactureStatus('${f.id}','En retard')">Retard</button>`:''}
    ${canWrite?`<button class="btn sm danger" style="margin-left:4px" onclick="delFac('${f.id}')">✕</button>`:''}
    </td>
    </tr>`;
  }).join('')}
  ${ventes.length===0?`<tr><td colspan="7" class="empty">Aucune vente${UI.search.factures||UI.factureFilterStatus?' pour ce filtre':''}</td></tr>`:''}
  </tbody>
  </table></div>
  ${renderPager('factures',totalPages)}</div>`;
}

function vDonListe(){
  const canWrite=hasPerm('perm_facturation','write');
  const donsRaw=D.factures.filter(isDonationReceipt).map(f=>({...f,statut:normalizeFactureStatus(f.statut,f.date_op)}));
  const {rows:dons,totalPages}=paginateList(donsRaw,'dons');
  return`<div>
  <div class="toolbar">
  <div style="font-size:12px;color:var(--txt2);flex:1;min-width:180px">Créez et imprimez des reçus pour les dons manuels du club.</div>
  ${canWrite?`<button class="btn primary" onclick="nouvDon()">+ Nouveau reçu de don</button>`:''}
  </div>
  <div class="wrap"><table>
  <thead><tr><th>N° reçu</th><th>Date</th><th>Donateur</th><th>Objet</th><th>Montant</th><th></th></tr></thead>
  <tbody>${dons.map(f=>{
    const tot=(f.lignes||[]).reduce((s,l)=>s+(+l.qte||0)*(+l.pu||0),0);
    return`<tr>
    <td><strong style="font-weight:500">${f.numero}</strong></td>
    <td>${fd(f.date_op)}</td>
    <td>${f.destinataire||''}</td>
    <td>${f.objet||''}</td>
    <td><strong>${tot.toFixed(2)} €</strong></td>
    <td style="white-space:nowrap">
    ${canWrite?`<button class="btn sm" onclick="loadDon('${f.id}')">Modifier</button>`:''}
    <button class="btn sm gold" style="margin-left:4px" onclick="printFac('${f.id}')">🖨 Imprimer</button>
    ${canWrite?`<button class="btn sm danger" style="margin-left:4px" onclick="delFac('${f.id}')">✕</button>`:''}
    </td>
    </tr>`;
  }).join('')}
  ${dons.length===0?`<tr><td colspan="6" class="empty">Aucun reçu de don</td></tr>`:''}
  </tbody>
  </table></div>
  ${renderPager('dons',totalPages)}`;
}

function vFacEditor(){
  if(!hasPerm('perm_facturation','write')) return `<div class="empty">Accès en lecture seule sur les ventes.</div>`;
  const inv=UI.invState;
  const meta=currentInvMeta();
  return`<div class="g2" style="gap:20px;align-items:start">
  <div>
  <p class="stit" style="margin-top:0">${meta.infoTitle}</p>
  <div style="display:flex;flex-direction:column;gap:10px">
  <div class="fg"><label>${meta.numberLabel}</label><input id="inv-num" value="${inv.numero}" oninput="UI.invState.numero=this.value;updPrev()"></div>
  <div class="fg"><label>Date</label><input id="inv-date" type="date" value="${inv.date}" oninput="UI.invState.date=this.value;updPrev()"></div>
  <div class="fg"><label>${meta.partyLabel}</label>
  <input id="inv-dest" value="${inv.destinataire}" list="adh-dl" oninput="UI.invState.destinataire=this.value;updPrev()">
  <datalist id="adh-dl">${D.adherents.map(a=>`<option value="${a.nom} ${a.prenom}">`).join('')}</datalist>
  </div>
  <div class="fg"><label>${meta.addressLabel}</label><textarea id="inv-addr" rows="2" style="resize:vertical" oninput="UI.invState.adresse=this.value;updPrev()">${inv.adresse}</textarea></div>
  <div class="fg"><label>Objet</label><input id="inv-objet" value="${inv.objet}" oninput="UI.invState.objet=this.value;updPrev()"></div>
  </div>
  <p class="stit">Lignes</p>
  <div id="lgwrap">${renderLignes()}</div>
  <button class="btn sm" onclick="addL()">+ Ligne</button>
  <p class="stit">Notes</p>
  <textarea id="inv-notes" rows="2" style="resize:vertical;margin-bottom:12px" oninput="UI.invState.notes=this.value;updPrev()">${inv.notes}</textarea>
  <div style="display:flex;gap:8px">
  <button class="btn primary" onclick="saveFac()">${meta.saveLabel}</button>
  <button class="btn gold" onclick="printFacEditor()">🖨 Imprimer</button>
  </div>
  </div>
  <div>
  <p class="stit" style="margin-top:0">${meta.previewLabel}</p>
  <div id="inv-prev">${buildFacHTML(inv)}</div>
  </div>
  </div>`;
}

function renderLignes(){
  return UI.invState.lignes.map((l,i)=>`<div style="display:grid;grid-template-columns:1fr 55px 80px 24px;gap:6px;margin-bottom:6px;align-items:center">
  <input placeholder="Description" value="${l.desc}" oninput="updL(${i},'desc',this.value)">
  <input type="number" placeholder="Qté" value="${l.qte}" min="1" oninput="updL(${i},'qte',+this.value)">
  <input type="number" placeholder="P.U." value="${l.pu}" min="0" step="0.01" oninput="updL(${i},'pu',+this.value)">
  <button class="btn sm danger" onclick="rmL(${i})" style="padding:4px 6px">✕</button>
  </div>`).join('');
}

function currentInvMeta(kind=UI.invKind){
  return kind==='don'
  ? {
    docTitle:'REÇU DE DON',
    infoTitle:'Informations du reçu',
    numberLabel:'N° reçu',
    partyLabel:'Donateur',
    addressLabel:'Adresse du donateur',
    saveLabel:'💾 Enregistrer le reçu',
    previewLabel:'Aperçu du reçu'
  }
  : {
    docTitle:'FACTURE',
    infoTitle:'Informations de vente',
    numberLabel:'N° vente',
    partyLabel:'Destinataire',
    addressLabel:'Adresse destinataire',
    saveLabel:'💾 Enregistrer la vente',
    previewLabel:'Aperçu du document'
  };
}

function isDonationReceipt(f){
  return (f?.numero||'').startsWith('DON-') || /reçu de don/i.test(f?.objet||'');
}

function buildFacHTML(f){
  const logo=D.logoUrl?`<img src="${D.logoUrl}" style="width:100%;height:100%;object-fit:contain">`:`<span style="font-size:26px">🥊</span>`;
  const tot=(f.lignes||[]).reduce((s,l)=>s+(+l.qte||0)*(+l.pu||0),0);
  const deductible=tot*0.66;
  const ci=D.clubInfo||{};
  const clubName=ci.nom||DEFAULT_CLUB_NAME;
  const clubSiret=ci.siret||DEFAULT_SIRET;
  const meta=currentInvMeta(f?.kind||(isDonationReceipt(f)?'don':'facture'));
  const isDon=meta.docTitle==='REÇU DE DON';
  return`<div style="background:#fff;border:.5px solid #ddd;border-radius:10px;overflow:hidden;font-family:sans-serif;font-size:12px;color:#222">
  <div style="background:#111;padding:16px 20px;display:flex;justify-content:space-between;align-items:center">
  <div style="display:flex;align-items:center;gap:10px">
  <div style="width:44px;height:44px;border-radius:50%;overflow:hidden;border:2px solid #D4AC0D;background:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0">${logo}</div>
  <div><div style="color:#fff;font-size:12px;font-weight:500">${clubName}</div><div style="color:#aaa;font-size:10px;line-height:1.6">${ci.adresse||''}<br>${ci.email||''}</div></div>
  </div>
  <div style="text-align:right">
  <div style="color:#D4AC0D;font-size:15px;font-weight:500">${meta.docTitle}</div>
  <div style="color:#fff;font-size:11px;margin-top:2px">${f.numero||'—'}</div>
  <div style="color:#888;font-size:10px">${fd(f.date||f.date_op)}</div>
  </div>
  </div>
  <div style="padding:16px 20px">
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
  <div><div style="font-size:9px;font-weight:500;color:#888;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Émetteur</div>
  <p style="font-size:11px;line-height:1.6">${clubName}<br>${ci.adresse||''}<br>SIRET : ${clubSiret}</p></div>
  <div><div style="font-size:9px;font-weight:500;color:#888;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">${meta.partyLabel}</div>
  <p style="font-size:11px;line-height:1.6">${f.destinataire||'—'}<br>${(f.adresse||'').replace(/\n/g,'<br>')}</p></div>
  </div>
  ${f.objet?`<p style="font-size:10px;color:#888;margin-bottom:10px;padding:5px 8px;background:#f5f5f5;border-radius:4px;border-left:3px solid #111">Objet : ${f.objet}</p>`:''}
  <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:10px">
  <thead><tr style="background:#111;color:#fff">
  <th style="padding:5px 8px;text-align:left;font-weight:500">Désignation</th>
  <th style="padding:5px 8px;text-align:right;font-weight:500">Qté</th>
  <th style="padding:5px 8px;text-align:right;font-weight:500">P.U.</th>
  <th style="padding:5px 8px;text-align:right;font-weight:500">Total</th>
  </tr></thead>
  <tbody>${(f.lignes||[]).map((l,i)=>`<tr style="background:${i%2===0?'#fff':'#fafafa'}">
  <td style="padding:5px 8px;border-bottom:.5px solid #eee">${l.desc||'—'}</td>
  <td style="padding:5px 8px;border-bottom:.5px solid #eee;text-align:right">${l.qte}</td>
  <td style="padding:5px 8px;border-bottom:.5px solid #eee;text-align:right">${(+l.pu).toFixed(2)} €</td>
  <td style="padding:5px 8px;border-bottom:.5px solid #eee;text-align:right;font-weight:500">${((+l.qte)*(+l.pu)).toFixed(2)} €</td>
  </tr>`).join('')}</tbody>
  </table>
  <div style="display:flex;justify-content:flex-end">
  <div style="min-width:200px">
  ${isDon
    ? `
    <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:10px;color:#666"><span>Montant du don</span><span>${tot.toFixed(2)} €</span></div>
    <div style="display:flex;justify-content:space-between;padding:6px 10px;font-size:12px;font-weight:600;background:#f3efe7;color:#111;border:.5px solid #ddd;border-radius:4px;margin-top:4px"><span>Montant déductible des impôts (66 %)</span><span>${deductible.toFixed(2)} €</span></div>
    `
    : `
    <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:10px;color:#666"><span>Sous-total HT</span><span>${tot.toFixed(2)} €</span></div>
    <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:10px;color:#666"><span>TVA (exonérée art. 261-7-1°b)</span><span>0,00 €</span></div>
    <div style="display:flex;justify-content:space-between;padding:6px 10px;font-size:13px;font-weight:500;background:#111;color:#fff;border-radius:4px;margin-top:4px"><span>Total TTC</span><span>${tot.toFixed(2)} €</span></div>
    `}
    </div>
    </div>
    ${isDon?`<p style="font-size:10px;color:#666;margin-top:10px;padding:8px 10px;background:#f8f6f1;border-left:3px solid #D4AC0D;border-radius:4px">Réduction d'impôt indicative pour un particulier : <strong>${deductible.toFixed(2)} €</strong>, soit 66 % du montant versé.</p>`:''}
    ${f.notes?`<p style="font-size:10px;color:#888;margin-top:10px;padding-top:8px;border-top:.5px solid #eee">${f.notes}</p>`:''}
    </div>
    <div style="background:#111;padding:7px 20px;font-size:9px;color:#888;text-align:center">${clubName} — SIRET ${clubSiret} — Association loi 1901 — TVA non applicable, art. 261-7-1°b CGI</div>
    </div>`;
}

function updPrev(){const el=document.getElementById('inv-prev');if(el)el.innerHTML=buildFacHTML(UI.invState)}
function updL(i,k,v){UI.invState.lignes[i][k]=v;updPrev()}
function addL(){UI.invState.lignes.push({desc:'',qte:1,pu:0});const c=document.getElementById('lgwrap');if(c)c.innerHTML=renderLignes();updPrev()}
function rmL(i){if(UI.invState.lignes.length===1)return;UI.invState.lignes.splice(i,1);const c=document.getElementById('lgwrap');if(c)c.innerHTML=renderLignes();updPrev()}

function nouvFac(){
  const n=D.factures.length+1;
  UI.invKind='facture';
  UI.invState={numero:`FAC-${new Date().getFullYear()}-${String(n).padStart(3,'0')}`,date:td(),destinataire:'',adresse:'',objet:'',lignes:[{desc:'',qte:1,pu:0}],notes:''};
  UI.subTab.facture='edit';render();setTimeout(updPrev,80);
}
function nouvDon(){
  const n=D.factures.filter(isDonationReceipt).length+1;
  UI.invKind='don';
  UI.invState={numero:`DON-${new Date().getFullYear()}-${String(n).padStart(3,'0')}`,date:td(),destinataire:'',adresse:'',objet:'Reçu de don manuel',lignes:[{desc:'Don manuel au club',qte:1,pu:0}],notes:''};
  UI.subTab.facture='edit';render();setTimeout(updPrev,80);
}
function loadDon(id){
  const f=D.factures.find(x=>x.id===id);
  if(!f) return;
  UI.invKind='don';
  UI.invState={id:f.id,numero:f.numero||'',date:f.date_op||td(),destinataire:f.destinataire||'',adresse:f.adresse||'',objet:f.objet||'Reçu de don manuel',lignes:Array.isArray(f.lignes)&&f.lignes.length?f.lignes:[{desc:'Don manuel au club',qte:1,pu:0}],notes:f.notes||'',kind:'don'};
  UI.subTab.facture='edit';render();setTimeout(updPrev,80);
}
async function saveFac(){
  if(!requireExerciceActif()) return;
  if(!UI.invState.destinataire)return alert('Destinataire obligatoire');
  const payload={numero:UI.invState.numero,date_op:UI.invState.date,destinataire:UI.invState.destinataire,adresse:UI.invState.adresse,objet:UI.invState.objet,lignes:UI.invState.lignes,statut:normalizeFactureStatus(UI.invState.statut||'Émise',UI.invState.date),notes:UI.invState.notes,exercice_id:D.currentExo?.id||null};
  if(UI.invState.id){
    const {error}=await SB.from('factures').update(payload).eq('id',UI.invState.id);
    if(error)return alert('Erreur : '+error.message);
    const idx=D.factures.findIndex(f=>f.id===UI.invState.id);
    if(idx>=0) D.factures[idx]=normalizeFactureRow({...D.factures[idx],...payload});
    if(UI.invKind!=='don'){
      try{
        await syncVenteJournal(idx>=0?{...D.factures[idx],id:UI.invState.id}:{...payload,id:UI.invState.id});
      }catch(e){
        return alert('Vente enregistrée, mais écriture comptable non synchronisée : '+e.message);
      }
    }
  }else{
    const {data,error}=await SB.from('factures').insert(payload).select().single();
    if(error)return alert('Erreur : '+error.message);
    D.factures.unshift(normalizeFactureRow(data));
    if(UI.invKind!=='don'){
      try{
        await syncVenteJournal(normalizeFactureRow(data));
      }catch(e){
        return alert('Vente enregistrée, mais écriture comptable non créée : '+e.message);
      }
    }
  }
  alert(UI.invKind==='don'?'Reçu de don enregistré.':'Vente enregistrée et écriture comptable créée.');
  UI.subTab.facture=UI.invKind==='don'?'dons':'liste';
  render();
}
async function setFactureStatus(id,status){
  if(!requireWritePerm('perm_facturation')) return;
  const next=normalizeFactureStatus(status,td());
  const patch={statut:next,updated_at:new Date().toISOString()};
  // Si marqué Payée : demander la date et le mode de règlement
  if(next==='Payée'){
    const dateReg=window.prompt(`Date de paiement (laisser vide = aujourd'hui ${td()}) :`,td())||td();
    const modeReg=window.prompt(`Mode de règlement :\n1 Virement\n2 Chèque\n3 Espèces\n4 CB\n5 HelloAsso\n6 Gratuit\n(saisir le numéro ou le nom)`)|| '';
    const modemap={'1':'Virement','2':'Chèque','3':'Espèces','4':'CB','5':'HelloAsso','6':'Gratuit'};
    const mode=modemap[modeReg.trim()]||modeReg.trim()||'';
    if(mode) patch.notes_paiement=`Payée le ${dateReg}${mode?' — '+mode:''}`;
    patch.date_paiement=dateReg;
  }
  const {error}=await SB.from('factures').update(patch).eq('id',id);
  if(error) return alert('Erreur : '+error.message);
  const idx=D.factures.findIndex(f=>f.id===id);
  if(idx>=0) D.factures[idx]={...D.factures[idx],...patch};
  notify('success',`Vente passée en "${next}".`,'Ventes');
  render();
}
async function delFac(id){
  if(!confirm('Supprimer ?'))return;
  await SB.from('factures').delete().eq('id',id);
  try{await deleteJournalAuto(autoPiece('vente',id));}catch(e){return alert('Vente supprimée, mais écriture comptable non supprimée : '+e.message);}
  D.factures=D.factures.filter(f=>f.id!==id);render();
}
function printFac(id){const f=D.factures.find(x=>x.id===id);if(f)pwPrint(buildFacHTML(f),`Vente ${f.numero}`)}
function printFacEditor(){pwPrint(buildFacHTML(UI.invState),'Aperçu vente')}
function pwPrint(html,title){
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>@import url('https://fonts.googleapis.com/css2?family=Petit+Formal+Script&display=swap');body{margin:20px;font-family:sans-serif}@media print{body{margin:0}}</style></head><body>${html}<script>setTimeout(()=>window.print(),300);<\/script></body></html>`);
  w.document.close();
}
async function relanceFactureEmail(id){
  const f=D.factures.find(x=>x.id===id);
  if(!f) return;
  const email=f.client_email||'';
  if(!email){
    notify('warn','Aucun email renseigné pour ce client. Modifiez la vente pour en ajouter un.','Relance');
    return;
  }
  const statut=normalizeFactureStatus(f.statut,f.date_op);
  const montant=euro(+f.montant_total||0);
  const num=esc(f.numero||f.id.slice(0,8).toUpperCase());
  const clubNom=esc(D.clubInfo?.nom||DEFAULT_CLUB_NAME);
  const clubEmail=D.clubInfo?.email||'';
  if(!confirm(`Envoyer une relance à ${email} pour la vente ${num} (${montant}) ?\n\nStatut actuel : ${statut}`)) return;
  try{
    const res=await fetch('/api/email/send',{
      method:'POST',
      credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        to:[{email,name:f.client_nom||email}],
        subject:`Rappel de paiement — ${num} — ${clubNom}`,
        html:`<p>Bonjour,</p>
<p>Nous vous rappelons que la vente <strong>${num}</strong> d'un montant de <strong>${montant}</strong> est en attente de règlement.</p>
<p>Merci de procéder au paiement dans les meilleurs délais.</p>
<p>Cordialement,<br>${clubNom}</p>`,
      })
    });
    if(res.ok){
      notify('success',`Relance envoyée à ${email}.`,'Ventes');
      // Logguer la relance dans les notes
      const patch={notes_paiement:(f.notes_paiement?f.notes_paiement+'\n':'')+`[Relance envoyée le ${td()} à ${email}]`,updated_at:new Date().toISOString()};
      await SB.from('factures').update(patch).eq('id',id);
      Object.assign(f,patch);
      render();
    } else {
      const err=await res.json().catch(()=>({}));
      notify('error','Échec envoi : '+(err?.error?.message||res.status),'Email');
    }
  }catch(e){
    notify('error','Erreur réseau : '+e.message,'Email');
  }
}

async function sendFactureEmail(id){
  const f=D.factures.find(x=>x.id===id);
  if(!f) return;
  const email=f.client_email||'';
  if(!email){
    notify('warn','Aucun email client renseigné pour cette vente.','Envoi PDF');
    return;
  }
  const num=esc(f.numero||f.id.slice(0,8).toUpperCase());
  const clubNom=esc(D.clubInfo?.nom||DEFAULT_CLUB_NAME);
  if(!confirm(`Envoyer le document ${num} par email à ${email} ?`)) return;
  notify('info',`Génération et envoi en cours...`,'Ventes');
  try{
    // Générer le PDF côté client puis envoyer via backend
    const pdfBlob=await genFacturePDFBlob(id);
    if(!pdfBlob){notify('error','Impossible de générer le PDF.','Ventes');return;}
    const reader=new FileReader();
    reader.onload=async()=>{
      const base64=reader.result.split(',')[1];
      const res=await fetch('/api/email/send',{
        method:'POST',
        credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          to:[{email,name:f.client_nom||email}],
          subject:`${num} — ${clubNom}`,
          html:`<p>Bonjour,</p><p>Veuillez trouver ci-joint votre document <strong>${num}</strong>.</p><p>Cordialement,<br>${clubNom}</p>`,
          attachments:[{name:`${num}.pdf`,content:base64,type:'application/pdf'}]
        })
      });
      if(res.ok){
        notify('success',`Document envoyé à ${email}.`,'Ventes');
      } else {
        const err=await res.json().catch(()=>({}));
        notify('error','Échec envoi : '+(err?.error?.message||res.status),'Email');
      }
    };
    reader.readAsDataURL(pdfBlob);
  }catch(e){
    notify('error','Erreur : '+e.message,'Ventes');
  }
}

// Générer le blob PDF d'une facture sans déclencher le téléchargement
async function genFacturePDFBlob(id){
  try{
    const jsPDF=await ensureJsPDF();
    const f=D.factures.find(x=>x.id===id);
    if(!f) return null;
    // Réutiliser la logique de genFacturePDF mais retourner un blob
    const doc=new jsPDF({unit:'mm',format:'a4'});
    // Construction minimale du PDF (identique à genFacturePDF existant)
    doc.setFontSize(10);
    doc.text(D.clubInfo?.nom||DEFAULT_CLUB_NAME,14,14);
    doc.text(f.client_nom||'',14,24);
    doc.text(`N° ${f.numero||f.id.slice(0,8).toUpperCase()} — ${fd(f.date_op)}`,14,34);
    const lignes=Array.isArray(f.lignes)?f.lignes:[];
    let y=44;
    lignes.forEach(l=>{
      doc.text(`${l.desc||''} — Qté: ${l.qte||1} × ${(+l.pu||0).toFixed(2)} €`,14,y);
      y+=7;
    });
    doc.text(`Total : ${(+f.montant_total||0).toFixed(2)} €`,14,y+4);
    return doc.output('blob');
  }catch(e){
    console.error('genFacturePDFBlob',e);
    return null;
  }
}

function genRecu(id){
  const a=D.adherents.find(x=>x.id===id);if(!a)return;
  const n=D.factures.length+1;
  const season=seasonFromDate(a.date_fin_adhesion||a.date_inscription)||currentSeasonLabel();
  UI.invKind='facture';
  UI.invState={
    numero:`REC-${new Date().getFullYear()}-${String(n).padStart(3,'0')}`,
    date:td(),destinataire:`${a.nom} ${a.prenom}`,
    adresse:[a.adresse,a.code_postal,a.ville].filter(Boolean).join(', '),
    objet:`Reçu de cotisation — Saison ${season}`,
    lignes:[
      {desc:`Cotisation ${a.discipline||'Club'} — saison ${season}`,qte:1,pu:+a.cotisation},
      ...(+a.montant_pass_region>0?[{desc:'Pass Région',qte:1,pu:+a.montant_pass_region}]:[])
    ],
    notes:`Mode de paiement : ${a.paiement}`
  };
  UI.tab='facture';UI.subTab.facture='edit';renderTabs();render();setTimeout(updPrev,100);
}

// ═══════════════════════════════════════════════════
// FEEDBACK / ENQUÊTES
// ═══════════════════════════════════════════════════

function vFeedback(){
  const sub=UI.subTab.feedback||'liste';
  const camp=UI.feedbackCampaignId?D.feedbackCampaigns.find(c=>c.id===UI.feedbackCampaignId):null;
  return`<div class="stabs">
  <button class="stab ${sub==='liste'?'active':''}" onclick="showST('feedback','liste')">Campagnes</button>
  ${camp?`<button class="stab ${sub==='detail'?'active':''}" onclick="showST('feedback','detail')">📊 ${esc(camp.titre)}</button>`:''}
  </div>
  ${sub==='detail'&&camp?vFeedbackDetail(camp):vFeedbackListe()}`;
}

function vFeedbackListe(){
  const canWrite=hasPerm('perm_administration','write');
  const q=(UI.search.feedback||'').toLowerCase();
  const filtered=D.feedbackCampaigns.filter(c=>(c.titre+' '+(c.description||'')).toLowerCase().includes(q));
  const {rows:f,totalPages}=paginateList(filtered,'feedback');
  const total=D.feedbackCampaigns.length;
  const actives=D.feedbackCampaigns.filter(c=>c.statut==='active').length;
  const reponses=D.feedbackResponses.length;
  return`<div class="view-head">
  <div>
  <div class="eyebrow">Communication adhérents</div>
  <h2>Feedback & Enquêtes</h2>
  <p>Créez des campagnes de retour d'expérience, invitez vos adhérents à répondre et analysez les résultats.</p>
  </div>
  ${canWrite?`<button class="btn primary" onclick="openModal('feedback_campaign')">+ Nouvelle campagne</button>`:''}
  </div>
  <div class="g4" style="margin-bottom:14px">
  <div class="sc"><div class="v">${total}</div><div class="l">Campagnes</div></div>
  <div class="sc"><div class="v vgo">${actives}</div><div class="l">Actives</div></div>
  <div class="sc"><div class="v">${reponses}</div><div class="l">Réponses totales</div></div>
  <div class="sc"><div class="v">${D.feedbackRecipients.filter(r=>r.repondu).length}</div><div class="l">Répondants</div></div>
  </div>
  <div class="toolbar">
  <input style="flex:1;min-width:160px" placeholder="Rechercher une campagne…" value="${UI.search.feedback||''}" oninput="UI.search.feedback=this.value;render()">
  <button class="btn" onclick="loadTabData('feedback',true).then(()=>render())">↺ Actualiser</button>
  </div>
  <div class="wrap"><table>
  <thead><tr><th>Titre</th><th>Statut</th><th>Dates</th><th>Destinataires</th><th>Réponses</th><th>Taux</th><th></th></tr></thead>
  <tbody>${f.map(c=>{
    const recs=D.feedbackRecipients.filter(r=>r.campaign_id===c.id);
    const reps=D.feedbackResponses.filter(r=>r.campaign_id===c.id);
    const taux=recs.length?Math.round(reps.length/recs.length*100):0;
    const badgeCls=c.statut==='active'?'bok':c.statut==='cloturee'?'bgray':'bwarn';
    const badgeLbl=c.statut==='active'?'Active':c.statut==='cloturee'?'Clôturée':'Brouillon';
    return`<tr>
    <td><strong style="font-weight:500">${esc(c.titre)}</strong>${c.description?`<br><span style="font-size:11px;color:var(--txt2)">${esc(c.description)}</span>`:''}</td>
    <td><span class="badge ${badgeCls}">${badgeLbl}</span></td>
    <td style="font-size:12px">${c.date_debut?fd(c.date_debut):'—'} → ${c.date_fin?fd(c.date_fin):'—'}</td>
    <td>${recs.length}</td>
    <td>${reps.length}</td>
    <td>${recs.length?`<strong>${taux}%</strong>`:'—'}</td>
    <td style="white-space:nowrap">
    <button class="btn sm" onclick="UI.feedbackCampaignId='${c.id}';showST('feedback','detail')">Détail</button>
    ${canWrite?`<button class="btn sm" style="margin-left:4px" onclick="openModal('feedback_campaign','${c.id}')">Modifier</button>
    ${c.statut==='brouillon'?`<button class="btn sm" style="margin-left:4px" onclick="activerCampagne('${c.id}')">▶ Lancer</button>`:''}
    ${c.statut==='active'?`<button class="btn sm" style="margin-left:4px" onclick="cloturerCampagne('${c.id}')">⏹ Clôturer</button>`:''}
    <button class="btn sm danger" style="margin-left:4px" onclick="delCampagne('${c.id}')">✕</button>`:''}
    </td></tr>`;
  }).join('')}
  ${f.length===0?`<tr><td colspan="7" class="empty">Aucune campagne</td></tr>`:''}
  </tbody></table></div>
  ${renderPager('feedback',totalPages)}`;
}

function vFeedbackDetail(camp){
  const canWrite=hasPerm('perm_administration','write');
  const recs=D.feedbackRecipients.filter(r=>r.campaign_id===camp.id);
  const reps=D.feedbackResponses.filter(r=>r.campaign_id===camp.id);
  const taux=recs.length?Math.round(reps.length/recs.length*100):0;
  let questions=[];
  try{questions=camp.questions?JSON.parse(camp.questions):[];}catch(e){}
  // Statistiques par question
  const stats=questions.map(q=>{
    const vals=reps.map(r=>{try{const p=JSON.parse(r.reponses);return p[q.id];}catch(e){return null;}}).filter(v=>v!=null);
    if(q.type==='note'){
      const avg=vals.length?vals.reduce((s,v)=>s+(+v),0)/vals.length:0;
      return{...q,vals,avg:avg.toFixed(1),count:vals.length};
    }
    if(q.type==='oui_non'){
      const oui=vals.filter(v=>v==='oui').length;
      return{...q,vals,oui,non:vals.length-oui,count:vals.length};
    }
    if(q.type==='choix'){
      const choixCounts={};
      vals.forEach(v=>{choixCounts[v]=(choixCounts[v]||0)+1;});
      return{...q,vals,choixCounts,count:vals.length};
    }
    return{...q,vals,count:vals.length};
  });
  const noteGlobale=reps.filter(r=>r.note_globale!=null);
  const avgGlobale=noteGlobale.length?noteGlobale.reduce((s,r)=>s+(+r.note_globale),0)/noteGlobale.length:null;
  return`<div class="view-head">
  <div>
  <div class="eyebrow">Feedback</div>
  <h2>${esc(camp.titre)}</h2>
  ${camp.description?`<p>${esc(camp.description)}</p>`:''}
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
  ${canWrite&&camp.statut==='brouillon'?`<button class="btn primary" onclick="activerCampagne('${camp.id}')">▶ Lancer la campagne</button>`:''}
  ${canWrite&&camp.statut==='active'?`<button class="btn" onclick="ouvrirEnvoi('${camp.id}')">📨 Inviter des adhérents</button><button class="btn" onclick="cloturerCampagne('${camp.id}')">⏹ Clôturer</button>`:''}
  <button class="btn" onclick="exportFeedbackCSV('${camp.id}')">⬇ Export CSV</button>
  <button class="btn" onclick="showST('feedback','liste')">← Retour</button>
  </div></div>
  <div class="g4" style="margin-bottom:14px">
  <div class="sc"><div class="v">${recs.length}</div><div class="l">Invités</div></div>
  <div class="sc"><div class="v vgo">${reps.length}</div><div class="l">Réponses</div></div>
  <div class="sc"><div class="v ${taux>=50?'vgo':''}">${recs.length?taux+'%':'—'}</div><div class="l">Taux réponse</div></div>
  <div class="sc"><div class="v">${avgGlobale!=null?avgGlobale.toFixed(1)+' / 5':'—'}</div><div class="l">Note moyenne</div></div>
  </div>
  ${stats.length?`<div class="card" style="margin-bottom:14px"><h3 style="margin-bottom:14px">Résultats par question</h3>
  ${stats.map(q=>`<div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border)">
  <div style="font-weight:500;margin-bottom:6px">${esc(q.texte)} <span style="font-size:11px;color:var(--txt2)">(${q.count} réponse${q.count>1?'s':''})</span></div>
  ${q.type==='note'?`<div style="font-size:22px;font-weight:700;color:var(--primary)">${q.avg} / 5</div>`:
    q.type==='oui_non'?`<div style="display:flex;gap:16px"><span class="badge bok">Oui : ${q.oui}</span><span class="badge bno">Non : ${q.non}</span></div>`:
    q.type==='choix'&&q.choixCounts?`<div style="display:flex;gap:8px;flex-wrap:wrap">${Object.entries(q.choixCounts).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<span class="badge bgray">${esc(k)} : ${v}</span>`).join('')}</div>`:
    q.vals.length?`<ul style="margin:4px 0 0 16px;font-size:13px">${q.vals.slice(0,5).map(v=>`<li>${esc(String(v))}</li>`).join('')}${q.vals.length>5?`<li style="color:var(--txt2)">… et ${q.vals.length-5} autre(s)</li>`:''}</ul>`:'<span style="color:var(--txt2);font-size:12px">Aucune réponse</span>'}
  </div>`).join('')}
  </div>`:''}
  ${reps.length?`<div class="card" style="margin-bottom:14px"><h3 style="margin-bottom:10px">Commentaires libres</h3>
  ${reps.filter(r=>r.commentaire).slice(0,20).map(r=>`<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">"${esc(r.commentaire)}"<span style="font-size:11px;color:var(--txt2);margin-left:8px">${fd(r.submitted_at)}</span></div>`).join('')}
  ${reps.filter(r=>r.commentaire).length===0?'<div class="empty">Aucun commentaire libre</div>':''}
  </div>`:''}
  <div class="card"><h3 style="margin-bottom:10px">Destinataires (${recs.length})</h3>
  <div class="wrap"><table><thead><tr><th>Nom</th><th>Email</th><th>Invité</th><th>Répondu</th><th></th></tr></thead>
  <tbody>${recs.map(r=>`<tr>
  <td>${esc(r.nom||'')} ${esc(r.prenom||'')}</td>
  <td style="font-size:12px">${esc(r.email)}</td>
  <td>${r.envoye?`<span class="badge bblue">${r.envoye_at?fd(r.envoye_at):'Oui'}</span>`:'<span class="badge bgray">Non</span>'}</td>
  <td>${r.repondu?`<span class="badge bok">${r.repondu_at?fd(r.repondu_at):'Oui'}</span>`:'<span class="badge bgray">Non</span>'}</td>
  <td>${canWrite?`<button class="btn sm danger" onclick="delRecipient('${r.id}')">✕</button>`:''}</td>
  </tr>`).join('')}
  ${recs.length===0?`<tr><td colspan="5" class="empty">Aucun destinataire</td></tr>`:''}
  </tbody></table></div></div>`;
}

async function activerCampagne(id){
  if(!confirm('Lancer cette campagne ? Les adhérents pourront être invités à répondre.')) return;
  const {error}=await SB.from('feedback_campaigns').update({statut:'active',date_debut:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id);
  if(error)return notify('error','Erreur : '+error.message,'Feedback');
  const c=D.feedbackCampaigns.find(x=>x.id===id);
  if(c){c.statut='active';c.date_debut=new Date().toISOString();}
  notify('success','Campagne lancée.','Feedback');render();
}

async function cloturerCampagne(id){
  if(!confirm('Clôturer cette campagne ? Elle ne pourra plus recevoir de réponses.')) return;
  const {error}=await SB.from('feedback_campaigns').update({statut:'cloturee',date_fin:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id);
  if(error)return notify('error','Erreur : '+error.message,'Feedback');
  const c=D.feedbackCampaigns.find(x=>x.id===id);
  if(c){c.statut='cloturee';c.date_fin=new Date().toISOString();}
  notify('success','Campagne clôturée.','Feedback');render();
}

async function delCampagne(id){
  if(!confirm('Supprimer cette campagne et toutes ses réponses ?')) return;
  const {error}=await SB.from('feedback_campaigns').delete().eq('id',id);
  if(error)return notify('error','Erreur : '+error.message,'Feedback');
  D.feedbackCampaigns=D.feedbackCampaigns.filter(c=>c.id!==id);
  D.feedbackRecipients=D.feedbackRecipients.filter(r=>r.campaign_id!==id);
  D.feedbackResponses=D.feedbackResponses.filter(r=>r.campaign_id!==id);
  if(UI.feedbackCampaignId===id){UI.feedbackCampaignId=null;showST('feedback','liste');}
  notify('success','Campagne supprimée.','Feedback');render();
}

async function delRecipient(id){
  if(!confirm('Retirer ce destinataire ?')) return;
  const {error}=await SB.from('feedback_recipients').delete().eq('id',id);
  if(error)return notify('error','Erreur : '+error.message,'Feedback');
  D.feedbackRecipients=D.feedbackRecipients.filter(r=>r.id!==id);
  notify('success','Destinataire retiré.','Feedback');render();
}

function ouvrirEnvoi(campaignId){
  UI.feedbackCampaignId=campaignId;
  openModal('feedback_invite');
}

async function saveFeedbackCampaign(id){
  const g=n=>document.getElementById(n);
  const titre=g('fc-titre').value.trim();
  const description=g('fc-desc').value.trim();
  const questionsRaw=g('fc-questions').value.trim();
  if(!titre)return alert('Le titre est obligatoire.');
  let questions=[];
  if(questionsRaw){
    try{questions=JSON.parse(questionsRaw);}catch(e){return alert('Format JSON des questions invalide.\n'+e.message);}
  }
  const d={titre,description,questions:JSON.stringify(questions),updated_at:new Date().toISOString()};
  if(id){
    const {error}=await SB.from('feedback_campaigns').update(d).eq('id',id);
    if(error)return alert('Erreur : '+error.message);
    const idx=D.feedbackCampaigns.findIndex(c=>c.id===id);
    if(idx>=0)D.feedbackCampaigns[idx]={...D.feedbackCampaigns[idx],...d};
  }else{
    const payload={...d,id:crypto.randomUUID(),statut:'brouillon',created_by:UI.currentUser?.id||null,created_at:new Date().toISOString()};
    const {data,error}=await SB.from('feedback_campaigns').insert(payload).select().single();
    if(error)return alert('Erreur : '+error.message);
    D.feedbackCampaigns.unshift(data);
  }
  closeModal();notify('success','Campagne enregistrée.','Feedback');render();
}

async function saveFeedbackInvite(){
  const campaignId=UI.feedbackCampaignId;
  if(!campaignId)return;
  const emailsRaw=document.getElementById('fi-emails')?.value||'';
  const fromAdh=document.getElementById('fi-all-adherents')?.checked;
  let recipients=[];
  if(fromAdh){
    recipients=D.adherents.filter(a=>a.email&&a.statut==='Actif').map(a=>({email:a.email.trim().toLowerCase(),nom:a.nom||'',prenom:a.prenom||'',adherent_id:a.id}));
  }else{
    recipients=emailsRaw.split(/[\n,;]/).map(e=>e.trim()).filter(Boolean).map(e=>({email:e.toLowerCase(),nom:'',prenom:'',adherent_id:null}));
  }
  if(!recipients.length)return alert('Aucun destinataire valide.');
  // Éviter les doublons avec les existants
  const existing=new Set(D.feedbackRecipients.filter(r=>r.campaign_id===campaignId).map(r=>r.email));
  const toAdd=recipients.filter(r=>!existing.has(r.email));
  if(!toAdd.length)return alert('Tous ces emails sont déjà invités.');
  const rows=toAdd.map(r=>({
    id:crypto.randomUUID(),
    campaign_id:campaignId,
    adherent_id:r.adherent_id||null,
    email:r.email,
    nom:r.nom,
    prenom:r.prenom,
    token:crypto.randomUUID().replace(/-/g,''),
    envoye:0,
    repondu:0,
    created_at:new Date().toISOString(),
    updated_at:new Date().toISOString(),
  }));
  const {data,error}=await SB.from('feedback_recipients').insert(rows).select();
  if(error)return alert('Erreur : '+error.message);
  D.feedbackRecipients.push(...(data||rows));
  closeModal();notify('success',`${toAdd.length} destinataire(s) ajouté(s).`,'Feedback');render();
}

function exportFeedbackCSV(campaignId){
  const camp=D.feedbackCampaigns.find(c=>c.id===campaignId);
  if(!camp)return;
  const reps=D.feedbackResponses.filter(r=>r.campaign_id===campaignId);
  let questions=[];
  try{questions=camp.questions?JSON.parse(camp.questions):[];}catch(e){}
  const headers=['Date réponse','Note globale','Commentaire',...questions.map(q=>q.texte)];
  const rows=reps.map(r=>{
    let parsed={};
    try{parsed=JSON.parse(r.reponses);}catch(e){}
    return[fd(r.submitted_at),r.note_globale||'',r.commentaire||'',...questions.map(q=>parsed[q.id]||'')];
  });
  const csv=[headers,...rows].map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`feedback_${camp.titre.replace(/\s+/g,'_')}.csv`;a.click();URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════
// ADMINISTRATION
// ═══════════════════════════════════════════════════
function vAdmin(){
  const sub=UI.subTab.admin;
  return`<div class="stabs">
  <button class="stab ${sub==='users'?'active':''}" onclick="showST('admin','users')">Utilisateurs & accès</button>
  <button class="stab ${sub==='audit'?'active':''}" onclick="showST('admin','audit')">Journal d'audit</button>
  <button class="stab ${sub==='club'?'active':''}" onclick="showST('admin','club')">Infos club</button>
  <button class="stab ${sub==='logo'?'active':''}" onclick="showST('admin','logo')">Logo</button>
  <button class="stab ${sub==='tarifs'?'active':''}" onclick="showST('admin','tarifs')">💶 Tarifs en ligne</button>
  <button class="stab ${sub==='imp_adh'?'active':''}" onclick="showST('admin','imp_adh')">📥 Import adhérents</button>
  <button class="stab ${sub==='imp_ecr'?'active':''}" onclick="showST('admin','imp_ecr')">📥 Import écritures</button>
  <button class="stab ${sub==='backup'?'active':''}" onclick="showST('admin','backup')">Sauvegarde</button>
  </div>
  ${sub==='users'?vUsers():sub==='audit'?vAudit():sub==='club'?vClub():sub==='logo'?vLogo():sub==='tarifs'?vTarifs():sub==='imp_adh'?vImpAdh():sub==='imp_ecr'?vImpEcr():vBackup()}`;
}

function vUsers(){
  if(!hasPerm('perm_administration'))return`<div class="empty">Accès réservé à l'administrateur</div>`;
  return`<div class="card" style="margin-bottom:14px">
  <div style="display:flex;justify-content:space-between;align-items:end;gap:12px;flex-wrap:wrap;margin-bottom:12px">
  <div>
  <p style="font-size:11px;font-weight:500;color:var(--txt2);margin-bottom:4px">PROFILS UTILISATEUR</p>
  <p style="font-size:12px;color:var(--txt2)">Définissez pour chaque rubrique si le profil n'a aucun accès, un accès en lecture seule, ou un accès complet en lecture et écriture. Les administrateurs conservent toujours l'accès complet.</p>
  </div>
  </div>
  <div style="display:grid;gap:10px">
  ${Object.entries(ROLES).map(([role,label])=>{
    const perms=getRolePerms(role);
    return `<div style="border:1px solid var(--brd);border-radius:14px;padding:12px;background:rgba(255,255,255,.56)">
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
    <strong>${label}</strong>
    ${role==='admin'
      ? `<span class="badge bblue">Accès complet</span>`
      : `<span style="font-size:11px;color:var(--txt2)">${D.users.filter(u=>u.role===role).length} utilisateur(s)</span>`}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:6px">
      ${PERM_META.map(([perm,txt])=>`
        <div style="display:flex;flex-direction:column;align-items:flex-start;justify-content:space-between;padding:4px 0;gap:6px">
        <span style="font-size:12px">${txt}</span>
        ${role==='admin'
          ? `<span class="badge bblue">Lecture / écriture</span>`
          : `<select style="font-size:12px;width:100%" onchange="toggleRolePerm('${role}','${perm}',this.value)">
          ${Object.entries(PERM_LEVELS).map(([level,meta])=>`<option value="${level}" ${perms[perm]===level?'selected':''}>${meta.label}</option>`).join('')}
          </select>`}
          </div>`).join('')}
          </div>
          </div>`;
  }).join('')}
  </div>
  </div>
  <button class="btn primary" style="margin-bottom:14px" onclick="openModal('user')">+ Ajouter un utilisateur</button>
  ${D.users.map(u=>{
    const col=AVC[D.users.indexOf(u)%AVC.length];
    const isMe=UI.currentUser?.id===u.id;
    const perms=getRolePerms(u.role);
    return`<div class="card" style="margin-bottom:10px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:${UI.currentUser?.role==='admin'?'12':'0'}px">
    <div style="width:40px;height:40px;border-radius:50%;background:${col}22;color:${col};display:flex;align-items:center;justify-content:center;font-weight:500;flex-shrink:0">${(u.prenom[0]||'')+(u.nom[0]||'')}</div>
    <div style="flex:1"><div style="font-weight:500">${u.prenom} ${u.nom} ${isMe?'<span class="badge bok">Vous</span>':''}</div><div style="font-size:11px;color:var(--txt2)">${u.email}</div></div>
    <span style="font-size:11px;padding:3px 8px;border-radius:99px;font-weight:500;background:${u.role==='admin'?'#dfe6fd':'var(--bg3)'};color:${u.role==='admin'?'#1a3a9e':'var(--txt2)'}">${ROLES[u.role]||u.role}</span>
    <span class="badge ${u.actif?'bok':'bno'}" style="margin-left:6px">${u.actif?'Actif':'Inactif'}</span>
    <button class="btn sm" style="margin-left:8px" onclick="openModal('user','${u.id}')">Modifier</button>
    ${isMe?`<button class="btn sm" style="margin-left:4px" onclick="openPasswordModal()">Mot de passe</button>`:''}
    </div>
    ${UI.currentUser?.role==='admin'?`
      <div style="background:var(--bg2);border-radius:var(--r);padding:10px 12px">
      <p style="font-size:11px;font-weight:500;color:var(--txt2);margin-bottom:8px">ONGLETS HÉRITÉS DU PROFIL</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
      ${u.role==='admin'
        ? `<span class="badge bblue">Tous les onglets</span>`
        : PERM_META.filter(([perm])=>perms[perm] && perms[perm]!=='none').map(([perm,txt])=>`<span class="badge bgray">${txt} · ${PERM_LEVELS[perms[perm]]?.label||perms[perm]}</span>`).join('') || `<span class="badge bno">Aucun onglet actif</span>`}
        </div>
        </div>`:''}
        </div>`;
  }).join('')}`;
}

function vAudit(){
  if(!hasPerm('perm_administration')) return`<div class="empty">Accès réservé à l'administrateur</div>`;
  return `<div style="display:flex;justify-content:flex-end;margin-bottom:8px">
  <button class="btn sm" onclick="exportAuditCSV()">⬇ Export CSV</button>
  </div>
  <div class="wrap"><table>
  <thead><tr><th>Date</th><th>Action</th><th>Entité</th><th>Utilisateur</th><th>Détails</th></tr></thead>
  <tbody>${(D.auditLogs||[]).map((log,i)=>{
    const det=esc(log.details||'');
    const short=det.slice(0,160);
    const hasMore=det.length>160;
    return`<tr>
    <td style="white-space:nowrap">${fd(log.created_at)}</td>
    <td><span class="badge bblue">${esc(log.action||'')}</span></td>
    <td>${esc(log.entity_type||'')}</td>
    <td style="font-size:11px">${esc(D.users.find(u=>u.id===log.user_id)?.email || log.user_id || 'système')}</td>
    <td style="font-size:11px;color:var(--txt2)">
    <span id="audit-det-${i}">${short}${hasMore?'…':''}</span>
    ${hasMore?`<button class="btn sm" style="margin-left:4px;font-size:10px;padding:1px 6px" onclick="
      const el=document.getElementById('audit-det-${i}');
      const btn=this;
      if(btn.textContent==='Voir tout'){el.textContent='${det.replace(/'/g,"\\'")}';btn.textContent='Réduire';}
      else{el.textContent='${short.replace(/'/g,"\\'")}…';btn.textContent='Voir tout';}
    ">Voir tout</button>`:''}
    </td>
    </tr>`;}).join('')}
    ${(D.auditLogs||[]).length===0?`<tr><td colspan="5" class="empty">Aucun événement</td></tr>`:''}
    </tbody>
    </table></div>`;
}

async function toggleRolePerm(role,perm,val){
  if(!requireWritePerm('perm_administration')) return;
  const next=normalizeRolePerms(D.rolePerms);
  if(role==='admin') return;
  next[role][perm]=val;
  const payload=JSON.stringify(next);
  const {error}=await SB.from('club_info').upsert({cle:'role_permissions',valeur:payload},{onConflict:'cle'});
  if(error) return alert('Erreur : '+error.message);
  D.rolePerms=next;
  D.clubInfo.role_permissions=payload;
  renderTabs();
  render();
}

function vClub(){
  const canWrite=hasPerm('perm_administration','write');
  const ci=D.clubInfo||{};
  return`<div style="max-width:460px;display:flex;flex-direction:column;gap:12px">
  <div class="fg"><label>Nom du club</label><input id="ci-nom" value="${ci.nom||''}"></div>
  <div class="fg"><label>Adresse</label><input id="ci-adr" value="${ci.adresse||''}"></div>
  <div class="fg"><label>Téléphone</label><input id="ci-tel" value="${ci.telephone||''}"></div>
  <div class="fg"><label>Email</label><input id="ci-email" value="${ci.email||''}"></div>
  <div class="fg"><label>SIRET</label><input id="ci-siret" value="${ci.siret||''}"></div>
  <div class="fg"><label>Code APE</label><input id="ci-ape" value="${ci.ape||''}"></div>
  ${canWrite?`<button class="btn primary" style="align-self:flex-start" onclick="saveClub()">💾 Sauvegarder</button>`:''}
  </div>`;
}

function vLogo(){
  const canWrite=hasPerm('perm_administration','write');
  return`<div style="max-width:440px">
  <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
  <div style="width:80px;height:80px;border-radius:50%;border:2px solid var(--gold);overflow:hidden;display:flex;align-items:center;justify-content:center;background:#fff">
  ${D.logoUrl?`<img src="${D.logoUrl}" style="width:100%;height:100%;object-fit:contain">`:`<span style="font-size:36px">🥊</span>`}
  </div>
  <div><p style="font-weight:500;margin-bottom:4px">Logo du club</p><p style="font-size:11px;color:var(--txt2)">PNG, JPG ou SVG</p></div>
  </div>
  ${canWrite?`<div class="dz" style="margin-bottom:12px" onclick="document.getElementById('logo-input').click()">
    <div style="font-size:28px;margin-bottom:6px">🖼</div>
    <p style="font-size:13px;font-weight:500">Importer depuis votre ordinateur</p>
    </div>
    <p style="font-size:12px;color:var(--txt2);margin-bottom:6px">Ou via URL Google Drive (fichier partagé publiquement) :</p>
    <div style="display:flex;gap:8px">
    <input id="logo-url" placeholder="https://drive.google.com/uc?id=..." style="flex:1">
    <button class="btn primary" onclick="loadLogoUrl()">Charger</button>
    </div>`:`<div class="empty">Accès en lecture seule sur l'administration.</div>`}
    </div>`;
}

// ── TARIFS EN LIGNE ───────────────────────────────────────
function vTarifs(){
  if(!hasPerm('perm_administration')) return`<div class="empty">Accès réservé à l'administrateur</div>`;
  const canWrite = hasPerm('perm_administration','write');
  const p = safeParseJSON(D.clubInfo?.inscription_pricing, {});
  loadInscriptionBoutiqueProducts();
  const updated = p.updated_at ? ` — mis à jour le ${fd(p.updated_at)}` : '';
  const fields = [
    {key:'base',           label:'Tarif de base',               desc:'Cotisation standard'},
    {key:'family',         label:'Tarif famille',               desc:'Par membre, 2 minimum'},
    {key:'pro',            label:'Tarif pro',                   desc:'Sur justificatif'},
    {key:'cseThales',      label:'Tarif CSE Thalès',            desc:'Sur justificatif'},
    {key:'bureau',         label:'Tarif Membres du Bureau',     desc:'Renouvellement reconnu uniquement'},
    {key:'passport',       label:'Passeport sportif',           desc:'Optionnel'},
    {key:'newMemberKit',   label:'Kit nouvelle inscription',    desc:'Première adhésion uniquement'},
    {key:'tshirt',         label:'T-shirt club',                desc:'Par pièce'},
    {key:'pantalon',       label:'Pantalon club',               desc:'Par pièce'},
    {key:'passRegionMale', label:'Remise Pass Région garçon',   desc:'Déduit de la cotisation'},
    {key:'passRegionFemale',label:'Remise Pass Région fille',  desc:'Déduit de la cotisation'},
  ];
  return`<div style="max-width:680px;display:flex;flex-direction:column;gap:14px">
  <div class="card">
  <p style="font-size:11px;font-weight:500;color:var(--txt2);letter-spacing:.06em;margin-bottom:4px">TARIFS DU FORMULAIRE D'INSCRIPTION${updated}</p>
  <p style="font-size:12px;color:var(--txt2);margin-bottom:16px">Ces montants sont lus en temps réel par <strong>inscription.americanfullfightingbons.fr</strong>. Toute sauvegarde est immédiatement visible sur le site.</p>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
  ${fields.map(f=>`<div class="fg">
    <label style="line-height:1.3">${esc(f.label)}<br><span style="font-weight:400">${esc(f.desc)}</span></label>
    <div style="display:flex;align-items:center;gap:6px">
    <input id="tp-${f.key}" type="number" min="0" step="0.50" value="${p[f.key]??''}" placeholder="0" ${canWrite?'':'readonly'} style="flex:1">
    <span style="font-size:12px;color:var(--txt2)">€</span>
    </div>
    </div>`).join('')}
    </div>
    ${canWrite?`<button class="btn primary" onclick="saveTarifs()">💾 Sauvegarder et publier</button>`:''}
    </div>
    <div class="card">
    <p style="font-size:11px;font-weight:500;color:var(--txt2);letter-spacing:.06em;margin-bottom:4px">PRODUITS COMMANDE INSCRIPTION</p>
    <p style="font-size:12px;color:var(--txt2);margin-bottom:12px">Ajoutez ici les produits optionnels affichés dans l'onglet <strong>Commande</strong> du site d'inscription. Source <strong>Gestion</strong> pour un produit libre, source <strong>Boutique</strong> pour reprendre un article du catalogue.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
    ${canWrite?`<button class="btn" onclick="addInscriptionOrderProduct('gestion')">+ Produit gestion</button>`:''}
    ${canWrite?`<button class="btn" onclick="addInscriptionOrderProduct('boutique')">+ Produit boutique</button>`:''}
    ${canWrite?`<button class="btn" onclick="refreshInscriptionBoutiqueProducts()">Actualiser la boutique</button>`:''}
    ${canWrite?`<button class="btn primary" onclick="saveInscriptionOrderProducts()">💾 Sauvegarder les produits</button>`:''}
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">${renderInscriptionOrderProductsRows(canWrite)}</div>
    </div>
    <div class="card">
    <p style="font-size:11px;font-weight:500;color:var(--txt2);letter-spacing:.06em;margin-bottom:6px">ENDPOINT UTILISÉ PAR LE SITE</p>
    <div style="display:flex;gap:8px;align-items:center">
    <code style="font-size:12px;background:var(--bg3);padding:8px 12px;border-radius:var(--r);flex:1">https://inscription.americanfullfightingbons.fr/api/public/tarifs</code>
    <a class="btn sm" href="https://inscription.americanfullfightingbons.fr/api/public/tarifs" target="_blank">Tester</a>
    </div>
    </div>
    </div>`;
}

async function saveTarifs(){
  if(!requireWritePerm('perm_administration')) return;
  const keys = ['base','family','pro','cseThales','bureau','passport','newMemberKit','tshirt','pantalon','passRegionMale','passRegionFemale'];
  const pricing = {};
  for(const key of keys){
    const v = parseFloat(document.getElementById('tp-'+key)?.value);
    if(Number.isFinite(v)) pricing[key] = v;
  }
  if(!Object.keys(pricing).length) return notify('warn','Renseignez au moins un tarif.');
  const payload = JSON.stringify({...pricing, updated_at: new Date().toISOString()});
  const {error} = await SB.from('club_info').upsert({cle:'inscription_pricing',valeur:payload},{onConflict:'cle'});
  if(error) return notify('error','Erreur : '+error.message);
  D.clubInfo.inscription_pricing = payload;
  notify('success','Tarifs publiés — le site d\'inscription les applique immédiatement ✓');
  render();
}

function setInscriptionOrderProductField(index,key,value){
  if(!requireWritePerm('perm_administration')) return;
  const items=getInscriptionOrderProducts();
  if(!items[index]) return;
  const next={...items[index],[key]:value};
  if(key==='price') next.price=Number.isFinite(Number(value))?Number(value):0;
  if(key==='defaultQtyNew') next.defaultQtyNew=Math.max(0,parseInt(value||0,10)||0);
  if(key==='requiresSize' || key==='active') next[key]=Boolean(value);
  if(key==='source' && value!=='boutique'){
    next.boutiqueProductId='';
  }
  items[index]=normalizeInscriptionOrderProduct(next);
  setInscriptionOrderProducts(items);
  render();
}

function addInscriptionOrderProduct(source='gestion'){
  if(!requireWritePerm('perm_administration')) return;
  const items=getInscriptionOrderProducts();
  items.push(normalizeInscriptionOrderProduct({
    source,
    name:source==='boutique'?'Produit boutique':'Nouveau produit',
    description:'',
    price:0,
    defaultQtyNew:0,
      requiresSize:false,
  }));
  setInscriptionOrderProducts(items);
  render();
}

function removeInscriptionOrderProduct(index){
  if(!requireWritePerm('perm_administration')) return;
  const items=getInscriptionOrderProducts();
  items.splice(index,1);
  setInscriptionOrderProducts(items);
  render();
}

function applyBoutiqueProductToInscriptionOrder(index,productId){
  if(!requireWritePerm('perm_administration')) return;
  const items=getInscriptionOrderProducts();
  const item=items[index];
  if(!item) return;
  const product=(D.inscriptionBoutiqueProducts||[]).find(p=>String(p.id)===String(productId));
  if(!product){
    item.boutiqueProductId=productId||'';
    item.source='boutique';
    setInscriptionOrderProducts(items);
    render();
    return;
  }
  items[index]=normalizeInscriptionOrderProduct({
    ...item,
    source:'boutique',
    boutiqueProductId:String(product.id),
                                                name:product.name,
                                                description:product.description,
                                                price:Number(product.price||0),
                                                requiresSize:Array.isArray(product.sizes) && product.sizes.length>0,
  });
  setInscriptionOrderProducts(items);
  render();
}

async function refreshInscriptionBoutiqueProducts(){
  await loadInscriptionBoutiqueProducts(true);
  render();
}

async function saveInscriptionOrderProducts(){
  if(!requireWritePerm('perm_administration')) return;
  const items=getInscriptionOrderProducts().filter(item=>item.name);
  const payload=JSON.stringify(items.map(normalizeInscriptionOrderProduct));
  const {error}=await SB.from('club_info').upsert({cle:'inscription_order_products',valeur:payload},{onConflict:'cle'});
  if(error) return notify('error','Erreur : '+error.message);
  D.clubInfo.inscription_order_products=payload;
  notify('success','Produits de commande publiés sur le site d\'inscription ✓');
  render();
}

// ── IMPORT ADHÉRENTS ──────────────────────────────────────
function vImpAdh(){
  const st=IMP.adh;
  return`<div>
  <div class="import-step">
  <h3><span class="step-num">1</span> Charger votre export DoliAsso ou CSV</h3>
  <p style="font-size:12px;color:var(--txt2);margin-bottom:12px">Compatible avec DoliAsso et tout export CSV proche. Seuls <strong>Nom</strong> et <strong>Prénom</strong> sont obligatoires.</p>
  <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
  <button class="btn primary" onclick="document.getElementById('imp-adh-file').click()">📂 Choisir un fichier</button>
  <select id="adh-sep" style="width:auto" onchange="IMP.adh.sep=this.value;if(IMP.adh.raw)parseImpAdh(IMP.adh.raw)">
  <option value=";">Séparateur : ; (point-virgule)</option>
  <option value=",">Séparateur : , (virgule)</option>
  <option value="&#9;">Séparateur : tabulation</option>
  <option value="|">Séparateur : | (pipe)</option>
  </select>
  </div>
  ${st.headers.length>0?`<div style="margin-top:10px"><span class="badge bok">✓ Chargé</span> <span style="font-size:12px;color:var(--txt2);margin-left:6px">${st.rows.length} ligne(s) — ${st.headers.length} colonne(s)</span></div>`:''}
  </div>
  ${st.headers.length>0?`
    <div class="import-step">
    <h3><span class="step-num">2</span> Correspondance des colonnes</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px">
    ${ADH_FIELDS.map(f=>`<div class="col-map">
      <span style="font-weight:500;font-size:12px">${f.label}</span>
      <span style="color:var(--txt2)">→</span>
      <select id="map-adh-${f.key}" style="font-size:12px" onchange="IMP.adh.mapping['${f.key}']=this.value">
      <option value="">— Ignorer —</option>
      ${st.headers.map(h=>`<option value="${h}" ${IMP.adh.mapping[f.key]===h?'selected':''}>${h}</option>`).join('')}
      </select>
      </div>`).join('')}
      </div>
      </div>
      <div class="import-step">
      <h3><span class="step-num">3</span> Aperçu (5 premières lignes)</h3>
      <div class="wrap">
      <table class="preview-table">
      <thead><tr>${ADH_FIELDS.filter(f=>IMP.adh.mapping[f.key]).map(f=>`<th>${f.label}</th>`).join('')}</tr></thead>
      <tbody>${st.rows.slice(0,5).map(r=>`<tr>${ADH_FIELDS.filter(f=>IMP.adh.mapping[f.key]).map(f=>`<td title="${r[IMP.adh.mapping[f.key]]||''}">${(r[IMP.adh.mapping[f.key]]||'').slice(0,25)||'—'}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
      </div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn green" style="padding:10px 20px" onclick="doImportAdh()" ${st.importing?'disabled':''}>
      ${st.importing?'⏳ Import en cours...':'✓ Importer '+st.rows.length+' adhérent(s)'}
      </button>
      <button class="btn" onclick="IMP.adh={raw:'',headers:[],rows:[],mapping:{},sep:';',importing:false};render()">Recommencer</button>
      </div>
      <div id="adh-imp-res"></div>`:''}
      <div class="import-step" style="background:var(--bg2);margin-top:14px">
      <h3 style="font-size:12px;margin-bottom:8px">📄 Format CSV exemple</h3>
      <code style="font-size:11px;color:var(--txt2);line-height:2;display:block;font-family:monospace">
      Nom;Prénom;Date naissance;Email;Type adhésion;Cotisation;Statut;Fin adhésion<br>
      DUPONT;Lucas;12/03/2005;lucas@mail.com;Club;320;Actif;31/08/2026<br>
      MARTIN;Emma;20/07/1998;emma@mail.com;CSE Thalès;280;Renouvellement;31/08/2026
      </code>
      </div>
      </div>`;
}

// ── IMPORT ÉCRITURES ──────────────────────────────────────
function vImpEcr(){
  const st=IMP.ecr;
  return`<div>
  <div class="import-step">
  <h3><span class="step-num">1</span> Charger votre export comptable DoliAsso ou CSV</h3>
  <p style="font-size:12px;color:var(--txt2);margin-bottom:12px">Compatible avec DoliAsso, Ciel Compta, EBP, Sage, Quadratus ou tout export CSV. <strong>Date, Libellé et Débit/Crédit</strong> sont obligatoires.</p>
  <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
  <button class="btn primary" onclick="document.getElementById('imp-ecr-file').click()">📂 Choisir un fichier</button>
  <select id="ecr-sep" style="width:auto" onchange="IMP.ecr.sep=this.value;if(IMP.ecr.raw)parseImpEcr(IMP.ecr.raw)">
  <option value=";">Séparateur : ; (point-virgule)</option>
  <option value=",">Séparateur : , (virgule)</option>
  <option value="&#9;">Séparateur : tabulation</option>
  <option value="|">Séparateur : | (pipe)</option>
  </select>
  </div>
  ${st.headers.length>0?`<div style="margin-top:10px"><span class="badge bok">✓ Chargé</span> <span style="font-size:12px;color:var(--txt2);margin-left:6px">${st.rows.length} ligne(s) — ${st.headers.length} colonne(s)</span></div>`:''}
  </div>
  ${st.headers.length>0?`
    <div class="import-step">
    <h3><span class="step-num">2</span> Correspondance des colonnes</h3>
    <p style="font-size:12px;color:var(--txt2);margin-bottom:10px">Si votre logiciel exporte un montant unique (positif = crédit, négatif = débit), mappez-le sur <em>Débit</em>.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px">
    ${ECR_FIELDS.map(f=>`<div class="col-map">
      <span style="font-weight:500;font-size:12px">${f.label}</span>
      <span style="color:var(--txt2)">→</span>
      <select id="map-ecr-${f.key}" style="font-size:12px" onchange="IMP.ecr.mapping['${f.key}']=this.value">
      <option value="">— Ignorer —</option>
      ${st.headers.map(h=>`<option value="${h}" ${IMP.ecr.mapping[f.key]===h?'selected':''}>${h}</option>`).join('')}
      </select>
      </div>`).join('')}
      </div>
      </div>
      <div class="import-step">
      <h3><span class="step-num">3</span> Aperçu (5 premières lignes)</h3>
      <div class="wrap">
      <table class="preview-table">
      <thead><tr>${ECR_FIELDS.filter(f=>IMP.ecr.mapping[f.key]).map(f=>`<th>${f.label}</th>`).join('')}<th>Exercice</th></tr></thead>
      <tbody>${st.rows.slice(0,5).map(r=>`<tr>${ECR_FIELDS.filter(f=>IMP.ecr.mapping[f.key]).map(f=>`<td>${(r[IMP.ecr.mapping[f.key]]||'').slice(0,25)||'—'}</td>`).join('')}<td style="font-size:10px;color:var(--txt2)">${D.currentExo?.libelle||'—'}</td></tr>`).join('')}</tbody>
      </table>
      </div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn green" style="padding:10px 20px" onclick="doImportEcr()" ${st.importing?'disabled':''}>
      ${st.importing?'⏳ Import en cours...':'✓ Importer '+st.rows.length+' écriture(s)'}
      </button>
      <button class="btn" onclick="IMP.ecr={raw:'',headers:[],rows:[],mapping:{},sep:';',importing:false};render()">Recommencer</button>
      </div>
      <div id="ecr-imp-res"></div>`:''}
      <div class="import-step" style="background:var(--bg2);margin-top:14px">
      <h3 style="font-size:12px;margin-bottom:8px">📄 Format CSV exemple</h3>
      <code style="font-size:11px;color:var(--txt2);line-height:2;display:block;font-family:monospace">
      Date;N° Pièce;Compte;Libellé;Débit;Crédit<br>
      05/09/2025;REC-001;7561 - Cotisations membres actifs;Cotisation Lucas Dupont;;320.00<br>
      01/10/2025;FAC-089;6061 - Fournitures non stockées;Gants de boxe;150.00;
      </code>
      </div>
      </div>`;
}

function vBackup(){
  return`<div>
  <div class="view-head">
  <div>
  <div class="eyebrow">Sécurité des données</div>
  <h2>Sauvegarde et exports</h2>
  <p>Centralisez les sauvegardes du club et récupérez rapidement les exports nécessaires pour le suivi administratif ou comptable.</p>
  </div>
  </div>
  <div class="g2" style="margin-bottom:14px">
  <div class="card"><p style="font-weight:500;margin-bottom:6px">💾 Export JSON</p>
  <p style="font-size:12px;color:var(--txt2);margin-bottom:10px">Sauvegarde complète de toutes les données.</p>
  <button class="btn primary" onclick="backupJSON()">Télécharger</button>
  </div>
  <div class="card"><p style="font-weight:500;margin-bottom:6px">📥 Import JSON</p>
  <p style="font-size:12px;color:var(--txt2);margin-bottom:10px">Restaure une sauvegarde complète et remplace les données courantes dans la base.</p>
  <button class="btn ${IMP.backup.restoring?'':'gold'}" onclick="triggerBackupImport()" ${IMP.backup.restoring?'disabled':''}>${IMP.backup.restoring?'Import en cours...':'Choisir un fichier'}</button>
  ${IMP.backup.lastMessage?`<div class="${IMP.backup.lastMessage.includes('Erreur')?'imp-err':'imp-ok'}" style="margin-top:10px">${IMP.backup.lastMessage}</div>`:''}
  </div>
  </div>
  <div class="card" style="margin-bottom:14px"><p style="font-weight:500;margin-bottom:6px">📁 Drive du club</p>
  <p style="font-size:12px;color:var(--txt2);margin-bottom:10px">Déposez le backup dans le dossier partagé.</p>
  <a href="https://drive.google.com/drive/folders/1CJc6yK6XBvpz4n78kasiLLKbJCk9y6-m" target="_blank" class="btn">Ouvrir Drive ↗</a>
  </div>
  <div class="card">
  <p style="font-weight:500;margin-bottom:8px">📊 Exports CSV</p>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
  <button class="btn sm" onclick="exportCSV()">Adhérents</button>
  <button class="btn sm" onclick="exportAchatsCSV()">Achats</button>
  <button class="btn sm" onclick="exportJournalCSV()">Journal</button>
  <button class="btn sm" onclick="exportGLCSV()">Grand livre</button>
  <button class="btn sm" onclick="exportFEC()" title="Format légal Dgfip — Fichier des Écritures Comptables">📋 FEC comptable</button>
  <button class="btn sm" onclick="exportAuditCSV()" title="Journal d'audit complet en CSV">🔍 Journal d'audit</button>
  </div>
  </div>
  <p style="font-size:12px;color:var(--txt2);margin-top:12px">✓ Données sauvegardées automatiquement dans la base (Cloudflare D1) à chaque action.</p>
  </div>`;
}

// ═══════════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════════
function renderModal(){
  document.querySelector('.modal-bg')?.remove();
  if(!UI.modal) return;
  let html='';

  if(UI.modal==='bank_preview'){
    html=vBankPreviewModal();
  }else if(UI.modal==='adh'){
    const a=UI.editObj||{nom:'',prenom:'',naissance:'',couleur_ceinture:'',numero_licence:'',email:'',telephone:'',adresse:'',code_postal:'',ville:'',discipline:'Club',droit_image:false,certificat:false,pass_region:false,montant_pass_region:0,reglement:false,cotisation:0,paiement:'Virement',statut:'Actif',date_inscription:td(),date_fin_adhesion:'',urgence_nom:'',urgence_telephone:'',urgence_lien:'',notes:'',pdf_public_url:'',pdf_nom_fichier:''};
    const signupDocs=getAdherentDocuments(a.id);
    html=`<div class="modal" style="max-width:720px"><h2>👥 ${UI.editObj?'Modifier':'Nouvel'} adhérent</h2>
    <div class="g2">
    <div class="fg"><label>Nom</label><input id="f-nom" value="${a.nom}"></div>
    <div class="fg"><label>Prénom</label><input id="f-prn" value="${a.prenom}"></div>
    <div class="fg"><label>Date de naissance</label><input id="f-nai" type="date" value="${a.naissance||''}"></div>
    <div class="fg"><label>Type adhésion</label><select id="f-dis" onchange="onAdhTypeChange(this.value)">${ADH_TYPES.map(d=>`<option ${a.discipline===d?'selected':''}>${d}</option>`).join('')}</select></div>
    <div class="fg"><label>Couleur de ceinture</label><select id="f-cei"><option value="">—</option>${CEINTURE_COLORS.map(c=>`<option value="${c}" ${a.couleur_ceinture===c?'selected':''}>${c}</option>`).join('')}${a.couleur_ceinture&&!CEINTURE_COLORS.includes(a.couleur_ceinture)?`<option value="${a.couleur_ceinture}" selected>${a.couleur_ceinture}</option>`:''}</select></div>
    <div class="fg"><label>Numéro de licence</label><input id="f-lic" value="${a.numero_licence||''}" placeholder="Ex. 12345678"></div>
    <div class="fg"><label>Email</label><input id="f-eml" value="${a.email||''}"></div>
    <div class="fg"><label>Téléphone</label><input id="f-tel" value="${a.telephone||''}"></div>
    <div class="fg full"><label>Adresse</label><input id="f-adr" value="${a.adresse||''}"></div>
    <div class="fg"><label>Code postal</label><input id="f-cp" value="${a.code_postal||''}"></div>
    <div class="fg"><label>Ville</label><input id="f-vil" value="${a.ville||''}"></div>
    <div class="fg full" style="background:var(--bg2);padding:10px;border-radius:var(--r)">
    <p style="font-size:12px;font-weight:500;margin-bottom:8px">Documents administratifs</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
    <label style="display:flex;align-items:center;gap:7px;font-size:13px;cursor:pointer"><input type="checkbox" id="f-di" ${a.droit_image?'checked':''} style="width:auto;accent-color:var(--red)"> Droit à l'image</label>
    <label style="display:flex;align-items:center;gap:7px;font-size:13px;cursor:pointer"><input type="checkbox" id="f-ce" ${a.certificat?'checked':''} style="width:auto;accent-color:var(--red)"> Certificat médical</label>
    <label style="display:flex;align-items:center;gap:7px;font-size:13px;cursor:pointer"><input type="checkbox" id="f-ri" ${a.reglement?'checked':''} style="width:auto;accent-color:var(--red)"> Règlement intérieur</label>
    </div>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
    <label style="display:flex;align-items:center;gap:7px;font-size:13px;cursor:pointer">
    <input type="checkbox" id="f-pr" ${a.pass_region?'checked':''} style="width:auto;accent-color:var(--red)" onchange="document.getElementById('f-mpr').style.display=this.checked?'flex':'none'"> Pass Région
    </label>
    <div id="f-mpr" style="display:${a.pass_region?'flex':'none'};align-items:center;gap:6px">
    <span style="font-size:12px;color:var(--txt2)">Montant pass :</span>
    <input id="f-mpr-val" type="number" value="${a.montant_pass_region||0}" min="0" step="0.01" style="width:80px">
    <span style="font-size:12px;color:var(--txt2)">€</span>
    </div>
    </div>
    </div>
    <div class="fg"><label>Cotisation (€)</label><input id="f-cot" type="number" value="${a.cotisation||0}" min="0" step="0.01"></div>
    <div class="fg"><label>Mode de paiement</label><select id="f-pay">${MODES_PAIE.map(p=>`<option ${a.paiement===p?'selected':''}>${p}</option>`).join('')}</select></div>
    <div class="fg"><label>Date d'inscription</label><input id="f-di2" type="date" value="${a.date_inscription||td()}" onchange="if(!document.getElementById('f-fin').value)document.getElementById('f-fin').value=defaultAdhesionEnd(this.value)"></div>
    <div class="fg"><label>Date fin d'adhésion</label><input id="f-fin" type="date" value="${a.date_fin_adhesion||defaultAdhesionEnd(a.date_inscription||td())}"></div>
    <div class="fg"><label>Statut</label><select id="f-sta">${ADH_STATUTS.map(s=>`<option ${a.statut===s?'selected':''}>${s}</option>`).join('')}</select></div>
    <div class="fg full" style="background:var(--bg2);padding:10px;border-radius:var(--r)">
    <p style="font-size:12px;font-weight:500;margin-bottom:8px">Personne à prévenir en cas d'urgence</p>
    <div class="g3">
    <div class="fg"><label>Nom</label><input id="f-urn" value="${a.urgence_nom||''}"></div>
    <div class="fg"><label>Téléphone</label><input id="f-urt" value="${a.urgence_telephone||''}"></div>
    <div class="fg"><label>Lien (parent, conjoint...)</label><input id="f-url" value="${a.urgence_lien||''}"></div>
    </div>
    </div>
    <div class="fg full" style="background:var(--bg2);padding:10px;border-radius:var(--r)">
    <p style="font-size:12px;font-weight:500;margin-bottom:8px">Document PDF adhérent</p>
    ${a.id?`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="btn sm" onclick="trigPDF('adherents','${a.id}')">${a.pdf_public_url?'Remplacer le PDF':'Téléverser un PDF'}</button>
      ${a.pdf_public_url?`<a class="btn sm" href="${a.pdf_public_url}" target="_blank">Ouvrir</a><span style="font-size:12px;color:var(--txt2)">${a.pdf_nom_fichier||'document.pdf'}</span>`:`<span style="font-size:12px;color:var(--txt2)">Aucun fichier stocké</span>`}
      </div>`:`<p style="font-size:12px;color:var(--txt2)">Enregistrez d'abord l'adhérent, puis ajoutez son PDF.</p>`}
      </div>
      <div class="fg full" style="background:var(--bg2);padding:10px;border-radius:var(--r)">
      <p style="font-size:12px;font-weight:500;margin-bottom:8px">Pièces de l'inscription en ligne</p>
      ${signupDocs.length?`<div style="display:flex;flex-direction:column;gap:8px">
        ${signupDocs.map(doc=>`<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
          <div>
          <div style="font-size:13px;font-weight:600">${esc(doc.label)}</div>
          <div style="font-size:12px;color:var(--txt2)">${esc(doc.name)}</div>
          </div>
          <a class="btn sm" href="${doc.url}" target="_blank">Ouvrir</a>
          </div>`).join('')}
          </div>`:`<p style="font-size:12px;color:var(--txt2)">Aucune pièce issue de l'inscription web n'est rattachée à cet adhérent.</p>`}
          </div>
          <div class="fg full"><label>Notes</label><textarea id="f-not" rows="2" style="resize:vertical">${a.notes||''}</textarea></div>
          ${a.id&&D.loaded.diplomesArchive?`<div class="fg full" style="background:var(--bg2);padding:10px;border-radius:var(--r)">
          <p style="font-size:12px;font-weight:500;margin-bottom:8px">🎓 Diplômes reçus</p>
          ${(()=>{
            const diplAdh=(D.diplomes||[]).filter(d=>d.adherent_id===a.id).sort((x,y)=>(y.date_emission||'').localeCompare(x.date_emission||''));
            return diplAdh.length
              ?`<div style="display:flex;flex-direction:column;gap:6px">${diplAdh.map(d=>`<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:6px 8px;background:var(--bg);border-radius:8px;flex-wrap:wrap">
                <div><span style="font-size:13px;font-weight:500">${esc(d.ceinture||d.titre||'Diplôme')}</span>${d.delivre_par?`<span style="font-size:11px;color:var(--txt2);margin-left:8px">par ${esc(d.delivre_par)}</span>`:''}</div>
                <div style="display:flex;gap:8px;align-items:center">
                <span style="font-size:12px;color:var(--txt2)">${fd(d.date_emission)}</span>
                ${d.pdf_storage_path?`<a class="btn sm" href="${buildStorageObjectUrl(DIPLOME_PDF_BUCKET,d.pdf_storage_path)}" target="_blank">PDF</a>`:''}
                </div>
                </div>`).join('')}</div>`
              :`<p style="font-size:12px;color:var(--txt2)">Aucun diplôme émis pour cet adhérent.</p>`;
          })()}
          </div>`:(a.id?`<div class="fg full" style="background:var(--bg2);padding:10px;border-radius:var(--r)"><p style="font-size:12px;font-weight:500;margin-bottom:4px">🎓 Diplômes reçus</p><p style="font-size:12px;color:var(--txt2)">Ouvrez l'onglet Diplômes pour charger l'historique.</p></div>`:'')}
          </div>
          <div class="modal-act"><button class="btn" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="saveAdh('${a.id||''}')">Enregistrer</button></div>
          </div>`;

  }else if(UI.modal==='compte'){
    html=`<div class="modal" style="max-width:380px"><h2>🏦 Nouveau compte</h2>
    <div style="display:flex;flex-direction:column;gap:10px">
    <div class="fg"><label>Nom</label><input id="c-nom" placeholder="Compte principal CM"></div>
    <div class="fg"><label>Numéro</label><input id="c-num" placeholder="30027 xxxxx"></div>
    <div class="fg"><label>Solde initial (€)</label><input id="c-sol" type="number" value="0" step="0.01"></div>
    </div>
    <div class="modal-act"><button class="btn" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="saveCpt()">Créer</button></div>
    </div>`;

  }else if(UI.modal==='ecr'){
    const e=UI.editObj||{date_op:td(),piece:'',compte:'471 - Comptes d attente',contrepartie:'512 - Banque',libelle:'',debit:0,credit:0};
    const typeBanner=e._isType?`<div id="ecr-type-hint" style="margin-bottom:14px;padding:10px 14px;background:#e8f4ea;border-radius:10px;border:1px solid #b2d8b5;font-size:12px;color:#1e7e34;display:flex;gap:8px;align-items:center"><span>⚡</span><span><strong>${esc(e._typeLabel||'Écriture type')}</strong> — vérifiez les montants et le libellé avant d'enregistrer.</span></div>`:'';
    html=`<div class="modal" style="max-width:540px"><h2>📊 Nouvelle écriture</h2>
    ${typeBanner}
    <div class="g2">
    <div class="fg"><label>Date</label><input id="e-dat" type="date" value="${e.date_op||td()}"></div>
    <div class="fg"><label>N° pièce</label><input id="e-pie" value="${esc(e.piece||'')}" placeholder="FAC-2025-001"></div>
    <div class="fg full"><label>Compte — Plan comptable loi 1901</label><select id="e-cpt" style="width:100%">${PLAN.map(p=>`<option value="${p}" ${p===e.compte?'selected':''}>${p}</option>`).join('')}</select></div>
    <div class="fg full"><label>Compte de contrepartie</label><select id="e-cpt-ctr" style="width:100%">${PLAN.map(p=>`<option value="${p}" ${p===e.contrepartie?'selected':''}>${p}</option>`).join('')}</select></div>
    <div class="fg full"><label>Libellé</label><input id="e-lib" value="${esc(e.libelle||'')}" placeholder="Description de l'opération"></div>
    <div class="fg"><label>Débit (€)</label><input id="e-deb" type="number" value="${e.debit||0}" min="0" step="0.01"></div>
    <div class="fg"><label>Crédit (€)</label><input id="e-cre" type="number" value="${e.credit||0}" min="0" step="0.01"></div>
    </div>
    <div style="background:var(--bg2);border-radius:var(--r);padding:10px;margin-top:12px;font-size:12px;color:var(--txt2)">Si vous ne renseignez qu'un débit ou qu'un crédit, la ligne de contrepartie sera créée automatiquement pour garder le journal équilibré.</div>
    <div class="modal-act"><button class="btn" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="saveEcr()">Enregistrer</button></div>
    </div>`;

  }else if(UI.modal==='equilibre_help'){
    const issues=pieceBalanceDiagnostics(jnlExo());
    const totalEcart=issues.reduce((sum,issue)=>sum+Math.abs(issue.ecart),0);
    html=`<div class="modal" style="max-width:860px"><h2>🧭 Assistant déséquilibres</h2>
    <div style="display:flex;flex-direction:column;gap:14px">
    <div class="card" style="padding:14px">
    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start">
    <div>
    <strong style="font-weight:600">${D.currentExo?.libelle||'Exercice actif'}</strong>
    <div style="font-size:12px;color:var(--txt2);margin-top:4px">Repérez les pièces déséquilibrées, corrigez-les une par une ou lancez une régularisation globale sur le compte 471.</div>
    </div>
    <span class="badge ${issues.length?'bno':'bok'}">${issues.length?`${issues.length} pièce(s) à traiter`:'Journal équilibré'}</span>
    </div>
    <div class="g3" style="margin-top:12px">
    <div class="sc"><div class="v ${issues.length?'vr':'vg'}">${issues.length}</div><div class="l">Pièces déséquilibrées</div></div>
    <div class="sc"><div class="v vr">${totalEcart.toFixed(2)} €</div><div class="l">Écart cumulé absolu</div></div>
    <div class="sc"><div class="v vg">${jnlExo().length}</div><div class="l">Lignes du journal</div></div>
    </div>
    ${issues.length?`<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
      ${hasPerm('perm_comptabilite','write')?`<button class="btn gold" onclick="regulariserEquilibreExo()">Régulariser tout sur 471</button>`:''}
      <button class="btn" onclick="closeModal()">Fermer</button>
      </div>`:`<div><div class="imp-ok" style="margin-top:12px">Aucune anomalie détectée sur l'exercice actif.</div><div style="margin-top:12px"><button class="btn" onclick="closeModal()">Fermer</button></div></div>`}
      </div>
      ${issues.map(issue=>{const analysis=buildEquilibreSuggestions(issue);return `<div class="card" style="padding:14px">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start">
        <div>
        <strong style="font-weight:600">${esc(issue.piece)}</strong>
        <div style="font-size:12px;color:var(--txt2);margin-top:4px">${fd(issue.firstDate)} · ${issue.rows.length} ligne(s) · Débit ${issue.debit.toFixed(2)} € · Crédit ${issue.credit.toFixed(2)} €</div>
        </div>
        <span class="badge ${issue.ecart===0?'bok':'bno'}">Écart ${issue.ecart>0?'+':''}${issue.ecart.toFixed(2)} €</span>
        </div>
        <div style="margin-top:10px;padding:10px 12px;background:var(--bg2);border-radius:14px;font-size:12px;color:var(--txt2)">
        <strong style="display:block;color:var(--txt);font-weight:600;margin-bottom:4px">Analyse</strong>
        Type probable : ${analysis.pieceType==='achat'?'achat':analysis.pieceType==='vente'?'vente':analysis.pieceType==='adhesion'?'adhésion / encaissement':'écriture générale'} ·
        il manque ${analysis.needSide==='credit'?'un crédit':'un débit'} de <strong style="color:var(--txt)">${analysis.amount.toFixed(2)} €</strong>.
        ${analysis.exactAccounts.length?`Comptes déjà présents : ${analysis.exactAccounts.map(esc).join(', ')}.`:'Aucun compte exploitable détecté dans la pièce.'}
        </div>
        <div style="margin-top:10px;font-size:12px;color:var(--txt2)">
        ${issue.rows.slice(0,4).map(row=>`<div style="display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-bottom:.5px solid var(--brd)">
          <span style="min-width:0;flex:1"><strong style="font-weight:500;color:var(--txt)">${esc(row.compte||'')}</strong> · ${esc(row.libelle||'')}</span>
          <span style="white-space:nowrap">${(+row.debit||0).toFixed(2)} / ${(+row.credit||0).toFixed(2)} €</span>
          </div>`).join('')}
          ${issue.rows.length>4?`<div style="margin-top:6px">… ${issue.rows.length-4} autre(s) ligne(s)</div>`:''}
          </div>
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
          ${analysis.suggestions.map((s,idx)=>`<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 12px;border:1px solid var(--brd);border-radius:14px;background:rgba(255,255,255,.62)">
            <div style="min-width:240px;flex:1">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <strong style="font-weight:600">${esc(s.compte)}</strong>
            <span class="badge ${idx===0?'bok':'bgray'}">${idx===0?'Suggestion prioritaire':`Score ${s.score}`}</span>
            </div>
            <div style="font-size:12px;color:var(--txt2);margin-top:4px">${esc(s.reason)}</div>
            </div>
            ${hasPerm('perm_comptabilite','write')?`<button class="btn ${idx===0?'primary':''}" onclick='regulariserPieceEquilibreAvecCompte(${JSON.stringify(issue.key)}, ${JSON.stringify(s.compte)}, ${JSON.stringify('Régularisation suggérée')})'>Utiliser</button>`:''}
            </div>`).join('')}
            </div>
            ${hasPerm('perm_comptabilite','write')?`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
              <button class="btn" onclick='regulariserPieceEquilibre(${JSON.stringify(issue.key)})'>Forcer sur 471</button>
              </div>`:''}
              </div>`;}).join('')}
              </div>
              </div>`;

  }else if(UI.modal==='achat'){
    const a=UI.editObj||{date_op:td(),fournisseur:'',designation:'',categorie:'Équipement',montant:0,mode_paiement:'Virement',reference_paiement:'',statut:'nouveau',piece:'',notes:'',pdf_public_url:'',pdf_nom_fichier:''};
    html=`<div class="modal" style="max-width:580px"><h2>🛒 ${UI.editObj?'Modifier':'Nouvel'} achat</h2>
    <div class="g2">
    <div class="fg"><label>Date</label><input id="a-dat" type="date" value="${a.date_op}"></div>
    <div class="fg"><label>Fournisseur</label><input id="a-fou" value="${a.fournisseur}"></div>
    <div class="fg full"><label>Désignation</label><input id="a-des" value="${a.designation||''}"></div>
    <div class="fg"><label>Catégorie</label><select id="a-cat">${['Équipement','Location','Textile','Fournitures','Transport','Formation','Autre'].map(c=>`<option ${a.categorie===c?'selected':''}>${c}</option>`).join('')}</select></div>
    <div class="fg"><label>Montant TTC (€)</label><input id="a-mnt" type="number" value="${a.montant}" min="0" step="0.01"></div>
    <div class="fg"><label>Mode de paiement</label><select id="a-mod">${MODES_PAIE.map(p=>`<option ${a.mode_paiement===p?'selected':''}>${p}</option>`).join('')}</select></div>
    <div class="fg"><label>Référence paiement</label><input id="a-ref" value="${a.reference_paiement||''}" placeholder="N° chèque, réf. virement..."></div>
    <div class="fg"><label>N° pièce justificative</label><input id="a-pie" value="${a.piece||''}" placeholder="FA-001"></div>
    <div class="fg"><label>Statut</label><select id="a-sta">${[['nouveau','Nouveau'],['valide','Validé'],['paye','Payé'],['refuse','Refusé']].map(([v,l])=>`<option value="${v}" ${a.statut===v?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="fg full" style="background:var(--bg2);padding:10px;border-radius:var(--r)">
    <p style="font-size:12px;font-weight:500;margin-bottom:8px">Facture PDF</p>
    ${a.id?`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="btn sm" onclick="trigPDF('achats','${a.id}')">${a.pdf_public_url?'Remplacer le PDF':'Téléverser le PDF'}</button>
      ${a.pdf_public_url?`<a class="btn sm" href="${a.pdf_public_url}" target="_blank">Ouvrir</a><span style="font-size:12px;color:var(--txt2)">${a.pdf_nom_fichier||'facture.pdf'}</span>`:`<span style="font-size:12px;color:var(--txt2)">Aucun fichier stocké</span>`}
      </div>`:`<p style="font-size:12px;color:var(--txt2)">Enregistrez d'abord l'achat, puis ajoutez sa facture PDF.</p>`}
      </div>
      <div class="fg full"><label>Notes</label><textarea id="a-not" rows="2" style="resize:vertical">${a.notes||''}</textarea></div>
      </div>
      <div class="modal-act"><button class="btn" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="saveAchat('${a.id||''}')">Enregistrer</button></div>
      </div>`;

  }else if(UI.modal==='user'){
    const u=UI.editObj||{prenom:'',nom:'',email:'',mot_de_passe:'',role:'membre',actif:true};
    html=`<div class="modal" style="max-width:440px"><h2>⚙️ ${UI.editObj?'Modifier':'Nouvel'} utilisateur</h2>
    <div class="g2">
    <div class="fg"><label>Prénom</label><input id="u-pre" value="${u.prenom}"></div>
    <div class="fg"><label>Nom</label><input id="u-nom" value="${u.nom}"></div>
    <div class="fg full"><label>Email (identifiant de connexion)</label><input id="u-eml" type="email" value="${u.email||''}"></div>
    <div class="fg full"><label>Mot de passe${UI.editObj?' (vide = inchangé)':''}</label><input id="u-pwd" type="password" placeholder="••••••••"></div>
    <div class="fg"><label>Rôle</label><select id="u-rol">${Object.entries(ROLES).map(([k,v])=>`<option value="${k}" ${u.role===k?'selected':''}>${v}</option>`).join('')}</select></div>
    <div class="fg"><label>Statut</label><select id="u-act"><option value="1" ${u.actif?'selected':''}>Actif</option><option value="0" ${!u.actif?'selected':''}>Inactif</option></select></div>
    </div>
    <div class="modal-act"><button class="btn" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="saveUser('${u.id||''}')">Enregistrer</button></div>
    </div>`;

  }else if(UI.modal==='pwd'){
    html=`<div class="modal" style="max-width:440px"><h2>🔐 Modifier mon mot de passe</h2>
    <div style="display:flex;flex-direction:column;gap:12px">
    <div class="fg"><label>Mot de passe actuel</label><input id="pwd-cur" type="password" placeholder="••••••••"></div>
    <div class="fg"><label>Nouveau mot de passe</label><input id="pwd-new" type="password" placeholder="Au moins 6 caractères"></div>
    <div class="fg"><label>Confirmation</label><input id="pwd-cfm" type="password" placeholder="Répétez le nouveau mot de passe"></div>
    </div>
    <div class="modal-act"><button class="btn" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="saveOwnPassword()">Enregistrer</button></div>
    </div>`;

  }else if(UI.modal==='exo'){
    const yr=new Date().getFullYear();
    html=`<div class="modal" style="max-width:440px"><h2>📅 Nouvel exercice</h2>
    <div style="display:flex;flex-direction:column;gap:12px">
    <div class="fg"><label>Libellé</label><input id="exo-lib" value="Exercice ${yr}-${yr+1}"></div>
    <div class="fg"><label>Date de début</label><input id="exo-deb" type="date" value="${yr}-09-01"></div>
    <div class="fg"><label>Date de fin</label><input id="exo-fin" type="date" value="${yr+1}-08-31"></div>
    </div>
    <div style="background:var(--gold-l);border-radius:var(--r);padding:10px;margin-top:12px;font-size:12px;color:var(--gold-d)">⚠ Pensez à archiver l'exercice courant avant d'en créer un nouveau.</div>
    <div class="modal-act"><button class="btn" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="saveExo()">Créer</button></div>
    </div>`;
  }else if(UI.modal==='diplome_batch'){
    const adhList=sortAdherentsList([...D.adherents]);
    const sel=UI._diplomeBatchSel||{};
    const selCount=Object.values(sel).filter(Boolean).length;
    html=`<div class="modal" style="max-width:560px"><h2>📋 Impression batch de diplômes</h2>
    <p style="font-size:12px;color:var(--txt2);margin-bottom:12px">Sélectionnez les adhérents à inclure dans le PDF multi-pages. Le modèle de ceinture sera deviné automatiquement pour chacun.</p>
    <div style="display:flex;gap:8px;margin-bottom:10px">
    <button class="btn sm" onclick="D.adherents.forEach(a=>{UI._diplomeBatchSel[a.id]=true});renderModal()">Tout sélectionner</button>
    <button class="btn sm" onclick="UI._diplomeBatchSel={};renderModal()">Tout désélectionner</button>
    <span style="margin-left:auto;font-size:12px;color:var(--txt2);align-self:center">${selCount} sélectionné(s)</span>
    </div>
    <div style="max-height:340px;overflow-y:auto;border:1px solid var(--brd);border-radius:var(--r);padding:4px 0">
    ${adhList.map(a=>`<label style="display:flex;align-items:center;gap:10px;padding:8px 14px;cursor:pointer;border-bottom:1px solid var(--brd)">
      <input type="checkbox" style="width:auto" ${sel[a.id]?'checked':''} onchange="toggleDiplomeBatchAdh('${a.id}')">
      <span style="flex:1">${esc(a.nom)} ${esc(a.prenom)}</span>
      ${a.couleur_ceinture?`<span class="badge bgray">${esc(a.couleur_ceinture)}</span>`:''}
      </label>`).join('')}
    </div>
    <div class="modal-act">
    <button class="btn" onclick="closeModal()">Annuler</button>
    <button class="btn primary" onclick="confirmDiplomeBatch()" ${!selCount?'disabled':''}>⬇ Générer ${selCount} diplôme(s)</button>
    </div>
    </div>`;
  }else if(UI.modal==='exo_close'){
    const exo=UI.editObj||D.currentExo;
    const diag=exerciceDiagnostics(exo?.id);
    const next=nextExerciceDefaults(exo);
    html=`<div class="modal" style="max-width:720px"><h2>🧾 Assistant de clôture</h2>
    <div style="display:flex;flex-direction:column;gap:14px">
    <div class="card" style="padding:14px">
    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
    <div><strong style="font-weight:600">${exo?.libelle||'Exercice'}</strong><div style="font-size:12px;color:var(--txt2);margin-top:4px">${fd(exo?.date_debut)} → ${fd(exo?.date_fin)}</div></div>
    <span class="badge ${diag.ecartJournal===0?'bok':'bno'}">${diag.ecartJournal===0?'Équilibré':'Déséquilibré'}</span>
    </div>
    <div class="g4" style="margin-top:12px">
    <div class="sc"><div class="v vr">${diag.totalDebit.toFixed(2)} €</div><div class="l">Débits</div></div>
    <div class="sc"><div class="v vg">${diag.totalCredit.toFixed(2)} €</div><div class="l">Crédits</div></div>
    <div class="sc"><div class="v ${diag.resultat>=0?'vg':'vr'}">${diag.resultat>=0?'+':''}${diag.resultat.toFixed(2)} €</div><div class="l">Résultat</div></div>
    <div class="sc"><div class="v ${diag.ecartJournal===0?'vg':'vr'}">${diag.ecartJournal.toFixed(2)} €</div><div class="l">Écart</div></div>
    </div>
    ${diag.issues.length?`<div class="imp-err" style="margin-top:12px">Des pièces sont déséquilibrées. Corrigez-les avant la clôture ou utilisez la régularisation automatique.<div style="margin-top:6px;font-size:11px">${diag.issues.slice(0,4).map(i=>`${i.piece} : ${i.ecart.toFixed(2)} €`).join('<br>')}</div></div>`:`<div class="imp-ok" style="margin-top:12px">Le journal de l'exercice est prêt pour la clôture.</div>`}
    </div>
    <div class="card" style="padding:14px">
    <p style="font-weight:600;margin-bottom:10px">Étapes de clôture</p>
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:10px;cursor:pointer"><input id="exo-close-report" type="checkbox" checked style="width:auto;accent-color:var(--red)"> Reporter automatiquement le résultat sur le compte 1060 - Réserves</label>
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:12px;cursor:pointer"><input id="exo-close-next" type="checkbox" checked style="width:auto;accent-color:var(--red)" onchange="document.getElementById('exo-next-fields').style.display=this.checked?'grid':'none'"> Créer automatiquement le nouvel exercice actif</label>
    <div id="exo-next-fields" class="g3" style="display:grid">
    <div class="fg full"><label>Libellé du nouvel exercice</label><input id="exo-next-lib" value="${next.libelle}"></div>
    <div class="fg"><label>Date de début</label><input id="exo-next-deb" type="date" value="${next.date_debut}"></div>
    <div class="fg"><label>Date de fin</label><input id="exo-next-fin" type="date" value="${next.date_fin}"></div>
    </div>
    </div>
    </div>
    <div class="modal-act">
    ${diag.issues.length?`<button class="btn gold" onclick="regulariserEquilibreExo()">Régulariser d'abord</button>`:''}
    <button class="btn" onclick="closeModal()">Annuler</button>
    <button class="btn primary" onclick="finalizeExoClose('${exo?.id||''}')" ${diag.ecartJournal!==0?'disabled':''}>Clôturer l'exercice</button>
    </div>
    </div>`;
  }

  if(UI.modal==='feedback_campaign'){
    const c=UI.editObj||{titre:'',description:'',questions:'[]'};
    let questionsFormatted='';
    try{questionsFormatted=JSON.stringify(JSON.parse(c.questions||'[]'),null,2);}catch(e){questionsFormatted=c.questions||'[]';}
    html=`<div class="modal" style="max-width:620px"><h2>💬 ${UI.editObj?'Modifier la':'Nouvelle'} campagne</h2>
    <div class="fg full"><label>Titre *</label><input id="fc-titre" value="${esc(c.titre||'')}" placeholder="Ex. Satisfaction fin de saison 2025-2026"></div>
    <div class="fg full"><label>Description</label><textarea id="fc-desc" rows="2" placeholder="Décrivez l'objectif de cette enquête…">${esc(c.description||'')}</textarea></div>
    <div class="fg full">
    <label>Questions <span style="font-size:11px;font-weight:400;color:var(--txt2)">(JSON — chaque objet : id, texte, type: "texte"|"note"|"oui_non"|"choix", options?)</span></label>
    <textarea id="fc-questions" rows="10" style="font-family:monospace;font-size:12px" placeholder='[\n  {"id":"q1","texte":"Comment évaluez-vous la saison ?","type":"note"},\n  {"id":"q2","texte":"Recommanderiez-vous le club ?","type":"oui_non"},\n  {"id":"q3","texte":"Vos commentaires libres","type":"texte"}\n]'>${esc(questionsFormatted)}</textarea>
    </div>
    <div class="modal-act">
    <button class="btn" onclick="closeModal()">Annuler</button>
    <button class="btn primary" onclick="saveFeedbackCampaign('${c.id||''}')">Enregistrer</button>
    </div></div>`;
  }else if(UI.modal==='feedback_invite'){
    const camp=D.feedbackCampaigns.find(c=>c.id===UI.feedbackCampaignId);
    const activeAdherents=D.adherents.filter(a=>a.email&&a.statut==='Actif');
    html=`<div class="modal" style="max-width:500px"><h2>📨 Inviter des destinataires</h2>
    ${camp?`<p style="margin-bottom:12px;font-size:13px;color:var(--txt2)">Campagne : <strong>${esc(camp.titre)}</strong></p>`:''}
    <div class="fg full" style="margin-bottom:10px">
    <label><input type="checkbox" id="fi-all-adherents" onchange="this.closest('.modal').querySelector('#fi-emails-wrap').style.display=this.checked?'none':'block'">
     Inviter tous les adhérents actifs avec email (${activeAdherents.length} personnes)</label>
    </div>
    <div id="fi-emails-wrap" class="fg full">
    <label>Emails (un par ligne, ou séparés par , ou ;)</label>
    <textarea id="fi-emails" rows="6" placeholder="jean.dupont@mail.com&#10;marie.martin@mail.com"></textarea>
    </div>
    <div class="modal-act">
    <button class="btn" onclick="closeModal()">Annuler</button>
    <button class="btn primary" onclick="saveFeedbackInvite()">Ajouter les destinataires</button>
    </div></div>`;
  }

  if(!html) return;
  const div=document.createElement('div');
  div.className='modal-bg';div.innerHTML=html;
  div.addEventListener('click',e=>{if(e.target===div)closeModal()});
  document.getElementById('app').appendChild(div);
}

// Écritures types — préremplir la modal écriture selon un modèle
const ECRITURE_TYPES={
  cotisation:{
    label:'Encaissement cotisation',
    lignes:[
      {compte:'5121 - Banque',libelle:'Cotisation membre',debit:0,credit:320},
      {compte:'7561 - Cotisations membres actifs',libelle:'Cotisation membre',debit:320,credit:0},
    ]
  },
  achat_fournisseur:{
    label:'Achat fournisseur',
    lignes:[
      {compte:'6061 - Fournitures non stockées',libelle:'Achat fournisseur',debit:0,credit:0},
      {compte:'5121 - Banque',libelle:'Achat fournisseur',debit:0,credit:0},
    ]
  },
  subvention:{
    label:'Subvention / Don',
    lignes:[
      {compte:'5121 - Banque',libelle:'Subvention reçue',debit:0,credit:0},
      {compte:'7411 - Subventions de fonctionnement',libelle:'Subvention reçue',debit:0,credit:0},
    ]
  }
};

function openEcritureType(type){
  if(!requireWritePerm('perm_comptabilite')) return;
  const tpl=ECRITURE_TYPES[type];
  if(!tpl) return openModal('ecr');
  // Pré-remplir l'état de la modal avec le modèle
  UI.modal='ecr';
  UI.editObj={
    _isType:true,
    _typeLabel:tpl.label,
    _lignesType:tpl.lignes,
    date_op:td(),
    exercice_id:D.currentExo?.id||null,
    piece:'',
    compte:tpl.lignes[0]?.compte||'',
    libelle:tpl.label,
    debit:(+tpl.lignes[0]?.debit||0).toFixed(2),
    credit:(+tpl.lignes[0]?.credit||0).toFixed(2),
  };
  renderModal();
  setTimeout(()=>{
    const hint=document.getElementById('ecr-type-hint');
    if(hint) hint.scrollIntoView({behavior:'smooth',block:'nearest'});
  },80);
}

function openModal(t,id){
  const permMap={adh:'perm_adherents',compte:'perm_banque',ecr:'perm_comptabilite',achat:'perm_achats',user:'perm_administration',exo:'perm_comptabilite',exo_close:'perm_comptabilite',feedback_campaign:'perm_administration',feedback_invite:'perm_administration'};
  if(permMap[t] && !requireWritePerm(permMap[t])) return;
  UI.modal=t;UI.editObj=null;
  if(id){
    if(t==='adh')   UI.editObj=D.adherents.find(a=>a.id===id);
    if(t==='achat') UI.editObj=D.achats.find(a=>a.id===id);
    if(t==='facture') UI.editObj=D.factures.find(f=>f.id===id);
    if(t==='user')  UI.editObj=D.users.find(u=>u.id===id);
    if(t==='exo_close') UI.editObj=D.exercices.find(e=>e.id===id);
    if(t==='feedback_campaign') UI.editObj=D.feedbackCampaigns.find(c=>c.id===id);
  }
  renderModal();
}
function openPasswordModal(){
  if(!UI.currentUser?.id) return;
  UI.modal='pwd';
  UI.editObj=null;
  renderModal();
}
function forcePasswordRotation(){
  openPasswordModal();
  alert('Votre mot de passe doit être renouvelé avant de continuer.');
}
function openDiplomeBatchModal(){
  UI.modal='diplome_batch';
  UI._diplomeBatchSel=UI._diplomeBatchSel||{};
  renderModal();
}

function toggleDiplomeBatchAdh(id){
  if(!UI._diplomeBatchSel) UI._diplomeBatchSel={};
  UI._diplomeBatchSel[id]=!UI._diplomeBatchSel[id];
  renderModal();
}

async function confirmDiplomeBatch(){
  const sel=Object.entries(UI._diplomeBatchSel||{}).filter(([,v])=>v).map(([id])=>id);
  if(!sel.length){notify('warn','Sélectionnez au moins un adhérent.','Batch');return;}
  closeModal();
  await printDiplomeBatch(sel);
  UI._diplomeBatchSel={};
}

function closeModal(){UI.modal=null;UI.editObj=null;renderModal()}

function achatCompteAuto(categorie){
  const map={
    'Équipement':'6051 - Achats de matériels et équipements sportifs',
    'Location':'6132 - Locations immobilières',
    'Textile':'6052 - Achats de textile et tenues',
    'Fournitures':'6061 - Fournitures non stockées',
    'Transport':'6241 - Transports sur achats',
    'Formation':'6226 - Honoraires',
    'Autre':'6580 - Charges diverses de gestion courante',
  };
  return map[categorie]||'6580 - Charges diverses de gestion courante';
}

function venteCompteAuto(f){
  const txt=`${f.objet||''} ${(f.lignes||[]).map(l=>l.desc||'').join(' ')}`.toLowerCase();
  if(txt.includes('manifestation')||txt.includes('buvette')||txt.includes('sponsor')) return '7080 - Produits des activités annexes';
  if(txt.includes('cotisation')) return '7561 - Cotisations membres actifs';
  if(txt.includes('stage')||txt.includes('cours')) return '7061 - Cours et stages';
  return '7060 - Prestations de services';
}

function paiementCompteAuto(mode){
  if(mode==='Gratuit') return '471 - Comptes d attente';
  return mode==='Espèces' ? '5300 - Caisse' : '512 - Banque';
}

function autoPiece(type,id){
  return `${type==='achat'?'ACH':'VTE'}-${String(id).slice(0,8)}`;
}

function autoPiecePrefix(type,id){
  return `${type}-${String(id).slice(0,8)}`;
}

function totalVente(f){
  return (f.lignes||[]).reduce((s,l)=>s+(+l.qte||0)*(+l.pu||0),0);
}

function libelleAchatAuto(a){
  return `Achat - ${a.fournisseur}${a.designation?` - ${a.designation}`:''}${a.piece?` - Pièce ${a.piece}`:''}`;
}

function libelleVenteAuto(f){
  return `Vente - ${f.destinataire||'Client'}${f.objet?` - ${f.objet}`:''}${f.numero?` - ${f.numero}`:''}`;
}

async function upsertJournalAuto(entry){
  const existing=D.journal.find(j=>j.piece===entry.piece);
  if(existing){
    const {error}=await SB.from('journal_comptable').update(entry).eq('id',existing.id);
    if(error) throw error;
    Object.assign(existing,entry);
  }else{
    const {data,error}=await SB.from('journal_comptable').insert(entry).select().single();
    if(error) throw error;
    D.journal.push(data);
  }
  D.journal.sort((a,b)=>(a.date_op||'').localeCompare(b.date_op||''));
}

async function deleteJournalAuto(piece){
  const rows=D.journal.filter(j=>j.piece===piece||(j.piece||'').startsWith(`${piece}-`));
  if(rows.length===0) return;
  const ids=rows.map(r=>r.id);
  const {error}=await SB.from('journal_comptable').delete().in('id',ids);
  if(error) throw error;
  D.journal=D.journal.filter(j=>!ids.includes(j.id));
}

async function deleteJournalAutoPrefix(prefix){
  const rows=D.journal.filter(j=>(j.piece||'').startsWith(prefix));
  if(rows.length===0) return;
  const ids=rows.map(r=>r.id);
  const {error}=await SB.from('journal_comptable').delete().in('id',ids);
  if(error) throw error;
  D.journal=D.journal.filter(j=>!ids.includes(j.id));
}

async function insertJournalRows(rows){
  if(!rows.length) return;
  const {data,error}=await SB.from('journal_comptable').insert(rows).select();
  if(error) throw error;
  D.journal.push(...(data||[]));
  D.journal.sort((a,b)=>(a.date_op||'').localeCompare(b.date_op||''));
}

async function syncAchatJournal(achat){
  const piece=autoPiece('achat',achat.id);
  await deleteJournalAuto(piece);
  if(achat.statut==='refuse'||achat.statut==='nouveau'||!(+achat.montant>0)){
    return;
  }
  const montant=parseFloat(achat.montant)||0;
  const dateOp=achat.date_op||td();
  const compteContrepartie=achat.statut==='paye' ? paiementCompteAuto(achat.mode_paiement) : '401 - Fournisseurs';
  await insertJournalRows([
    {
      date_op:dateOp,
      piece:`${piece}-CHG`,
      compte:achatCompteAuto(achat.categorie),
                          libelle:libelleAchatAuto(achat),
                          debit:montant,
                          credit:0,
                          exercice_id:achat.exercice_id||D.currentExo?.id||null
    },
    {
      date_op:dateOp,
      piece:`${piece}-CTR`,
      compte:compteContrepartie,
      libelle:libelleAchatAuto(achat),
                          debit:0,
                          credit:montant,
                          exercice_id:achat.exercice_id||D.currentExo?.id||null
    }
  ]);
}

async function syncVenteJournal(facture){
  const piece=autoPiece('vente',facture.id);
  const total=totalVente(facture);
  await deleteJournalAuto(piece);
  if(!(total>0)){
    return;
  }
  const dateOp=facture.date_op||facture.date||td();
  const libelle=libelleVenteAuto(facture);
  await insertJournalRows([
    {
      date_op:dateOp,
      piece:`${piece}-CLI`,
      compte:'411 - Adhérents et clients',
      libelle,
      debit:total,
      credit:0,
      exercice_id:facture.exercice_id||D.currentExo?.id||null
    },
    {
      date_op:dateOp,
      piece:`${piece}-PRO`,
      compte:venteCompteAuto(facture),
                          libelle,
                          debit:0,
                          credit:total,
                          exercice_id:facture.exercice_id||D.currentExo?.id||null
    }
  ]);
}

async function syncAdherentJournal(adherent){
  const prefix=autoPiecePrefix('ADH',adherent.id);
  await deleteJournalAutoPrefix(prefix);

  const cotisation=adherent.paiement==='Gratuit' ? 0 : (parseFloat(adherent.cotisation)||0);
  const passRegion=adherent.pass_region ? (parseFloat(adherent.montant_pass_region)||0) : 0;
  const total=cotisation+passRegion;
  if(total<=0) return;

  const dateOp=adherent.date_inscription||td();
  const base={
    date_op:dateOp,
    exercice_id:adherent.exercice_id||D.currentExo?.id||null
  };
  const nom=`${adherent.nom||''} ${adherent.prenom||''}`.trim();
  const comptePaiement=paiementCompteAuto(adherent.paiement);
  const rows=[
    {
      ...base,
      piece:`${prefix}-ENC`,
      compte:comptePaiement,
      libelle:`Encaissement adhésion - ${nom}`,
      debit:total,
      credit:0
    }
  ];
  if(cotisation>0){
    rows.push({
      ...base,
      piece:`${prefix}-COT`,
      compte:'7561 - Cotisations membres actifs',
      libelle:`Cotisation adhérent - ${nom}`,
      debit:0,
      credit:cotisation
    });
  }
  if(passRegion>0){
    rows.push({
      ...base,
      piece:`${prefix}-PAS`,
      compte:'7088 - Participations et produits accessoires Pass Région',
      libelle:`Pass Région - ${nom}`,
      debit:0,
      credit:passRegion
    });
  }
  await insertJournalRows(rows);
}

// ═══════════════════════════════════════════════════
// SAVE
// ═══════════════════════════════════════════════════
async function saveAdh(id){
  if(!requireExerciceActif()) return;
  const g=n=>document.getElementById(n);
  const inscription=g('f-di2').value||td();
  const finAdhesion=g('f-fin').value||defaultAdhesionEnd(inscription);
  const discipline=g('f-dis').value;
  const d=normalizeAdherentFinance({nom:g('f-nom').value.trim(),prenom:g('f-prn').value.trim(),naissance:g('f-nai').value||null,couleur_ceinture:g('f-cei').value.trim(),numero_licence:g('f-lic').value.trim(),discipline,email:g('f-eml').value.trim().toLowerCase(),telephone:g('f-tel').value.trim(),adresse:g('f-adr').value.trim(),code_postal:g('f-cp').value.trim(),ville:g('f-vil').value.trim(),droit_image:g('f-di').checked,certificat:g('f-ce').checked,pass_region:g('f-pr').checked,montant_pass_region:parseFloat(g('f-mpr-val')?.value)||0,reglement:g('f-ri').checked,cotisation:parseFloat(g('f-cot').value)||0,paiement:g('f-pay').value,statut:g('f-sta').value,date_inscription:inscription,date_fin_adhesion:finAdhesion,urgence_nom:g('f-urn').value.trim(),urgence_telephone:g('f-urt').value.trim(),urgence_lien:g('f-url').value.trim(),notes:g('f-not').value,exercice_id:D.currentExo?.id||null,updated_at:new Date().toISOString()});
  if(!d.nom||!d.prenom)return alert('Nom et prénom obligatoires');
  if(id){
    const {error}=await SB.from('adherents').update(d).eq('id',id);
    if(error)return alert('Erreur : '+error.message);
    const idx=D.adherents.findIndex(a=>a.id===id);
    if(idx>=0)D.adherents[idx]={...D.adherents[idx],...d};
    try{
      await syncAdherentJournal(idx>=0?{...D.adherents[idx],id}:{...d,id});
    }catch(e){
      return alert('Adhérent enregistré, mais écritures comptables non synchronisées : '+e.message);
    }
  }else{
    const {data,error}=await SB.from('adherents').insert(d).select().single();
    if(error)return alert('Erreur : '+error.message);
    D.adherents.push(data);
    D.adherents=sortAdherentsList(D.adherents);
    try{
      await syncAdherentJournal(data);
    }catch(e){
      return alert('Adhérent créé, mais écritures comptables non créées : '+e.message);
    }
  }
  closeModal();render();
}

async function saveCpt(){
  const nom=document.getElementById('c-nom').value.trim();if(!nom)return;
  const d={nom,numero:document.getElementById('c-num').value.trim(),solde_initial:parseFloat(document.getElementById('c-sol').value)||0};
  const {data,error}=await SB.from('comptes_bancaires').insert(d).select().single();
  if(error)return alert('Erreur : '+error.message);
  D.comptes.push({...data,transactions:[]});
  closeModal();render();
}

async function saveEcr(){
  if(!requireExerciceActif()) return;
  const lib=document.getElementById('e-lib').value.trim();if(!lib)return alert('Libellé obligatoire');
  const dateOp=document.getElementById('e-dat').value;
  const piece=document.getElementById('e-pie').value.trim()||`MAN-${Date.now()}`;
  const compte=document.getElementById('e-cpt').value;
  const contrepartie=document.getElementById('e-cpt-ctr').value;
  const debit=parseFloat(document.getElementById('e-deb').value)||0;
  const credit=parseFloat(document.getElementById('e-cre').value)||0;
  if(debit<=0&&credit<=0)return alert('Saisissez un débit ou un crédit.');
  if(debit>0&&credit>0)return alert('Saisissez un seul montant par ligne. La contrepartie sera créée automatiquement.');
  const rows=[
    {date_op:dateOp,piece:`${piece}-L1`,compte,libelle:lib,debit,credit,exercice_id:D.currentExo?.id||null},
    {date_op:dateOp,piece:`${piece}-L2`,compte:contrepartie,libelle:`Contrepartie - ${lib}`,debit:credit>0?credit:0,credit:debit>0?debit:0,exercice_id:D.currentExo?.id||null}
  ];
  try{
    await insertJournalRows(rows);
  }catch(error){
    return alert('Erreur : '+error.message);
  }
  closeModal();render();
}

async function saveAchat(id){
  if(!requireExerciceActif()) return;
  const g=n=>document.getElementById(n);
  const d={date_op:g('a-dat').value,fournisseur:g('a-fou').value.trim(),designation:g('a-des').value.trim(),categorie:g('a-cat').value,montant:parseFloat(g('a-mnt').value)||0,mode_paiement:g('a-mod').value,reference_paiement:g('a-ref').value.trim(),statut:g('a-sta').value,piece:g('a-pie').value.trim(),notes:g('a-not').value,exercice_id:D.currentExo?.id||null,updated_at:new Date().toISOString()};
  if(!d.fournisseur)return alert('Fournisseur obligatoire');
  if(id){
    const {error}=await SB.from('achats').update(d).eq('id',id);
    if(error)return alert('Erreur : '+error.message);
    const idx=D.achats.findIndex(a=>a.id===id);
    if(idx>=0)D.achats[idx]={...D.achats[idx],...d};
    try{
      await syncAchatJournal(idx>=0?{...D.achats[idx],id}:{...d,id});
    }catch(e){
      return alert('Achat enregistré, mais écriture comptable non synchronisée : '+e.message);
    }
  }else{
    const {data,error}=await SB.from('achats').insert(d).select().single();
    if(error)return alert('Erreur : '+error.message);
    D.achats.unshift(data);
    try{
      await syncAchatJournal(data);
    }catch(e){
      return alert('Achat enregistré, mais écriture comptable non créée : '+e.message);
    }
  }
  closeModal();render();
}
async function delAchat(id){
  if(!confirm('Supprimer ?'))return;
  await SB.from('achats').delete().eq('id',id);
  try{await deleteJournalAuto(autoPiece('achat',id));}catch(e){return alert('Achat supprimé, mais écriture comptable non supprimée : '+e.message);}
  D.achats=D.achats.filter(a=>a.id!==id);render()
}
async function validerAchat(id){
  const achat=D.achats.find(a=>a.id===id);
  const nom=achat?`${achat.fournisseur} — ${achat.designation||achat.categorie||''}`.trim():'cet achat';
  const commentaire=window.prompt(`Valider ${nom} ?\n\nCommentaire de validation (facultatif) :`);
  if(commentaire===null) return; // annulé
  const notes=(achat?.notes?achat.notes+'\n':'')+(commentaire?`[Validé le ${td()} par ${UI.currentUser?.prenom||'?'} : ${commentaire}]`:`[Validé le ${td()} par ${UI.currentUser?.prenom||'?'}]`);
  await SB.from('achats').update({statut:'valide',notes,updated_at:new Date().toISOString()}).eq('id',id);
  if(achat){
    achat.statut='valide';
    achat.notes=notes;
    try{await syncAchatJournal(achat);}catch(e){return alert('Achat validé, mais écriture comptable non synchronisée : '+e.message);}
  }
  notify('success',`Achat validé.`,'Achats');
  render();
}

async function saveUser(id){
  const g=n=>document.getElementById(n);
  const pwd=g('u-pwd').value;
  const d={prenom:g('u-pre').value.trim(),nom:g('u-nom').value.trim(),email:g('u-eml').value.trim().toLowerCase(),role:g('u-rol').value,actif:g('u-act').value==='1'};
  // Compatibilité avec les anciennes bases où les permissions utilisateur
  // sont stockées dans des colonnes booléennes NOT NULL.
  // La granularité read/write reste pilotée par D.rolePerms via club_info.
  const rolePerms=cloneRolePerms(D.rolePerms)[d.role]||DEFAULT_ROLE_PERMS[d.role]||{};
  PERM_META.forEach(([perm])=>{ d[perm]=(rolePerms[perm]||'none')!=='none'; });
  if(pwd) d.mot_de_passe_plain=pwd;
  const safeLocal={...d};
  delete safeLocal.mot_de_passe;
  if(!d.prenom||!d.nom||!d.email)return alert('Prénom, nom et email obligatoires');
  if(id){
    const {error}=await SB.from('utilisateurs').update(d).eq('id',id);
    if(error)return alert('Erreur : '+error.message);
    const idx=D.users.findIndex(u=>u.id===id);if(idx>=0)D.users[idx]={...D.users[idx],...safeLocal,must_change_password:pwd?true:D.users[idx].must_change_password};
  }else{
    if(!pwd)return alert('Mot de passe obligatoire');
    const {data,error}=await SB.from('utilisateurs').insert(d).select().single();
    if(error)return alert('Erreur : '+error.message);
    D.users.push(normalizeUserRow(data));
  }
  closeModal();render();
}

async function saveOwnPassword(){
  if(!UI.currentUser?.id) return;
  const current=document.getElementById('pwd-cur').value;
  const next=document.getElementById('pwd-new').value;
  const confirmPwd=document.getElementById('pwd-cfm').value;
  if(!next || next.length<8) return alert('Le nouveau mot de passe doit contenir au moins 8 caractères.');
  if(next!==confirmPwd) return alert('La confirmation du mot de passe ne correspond pas.');
  const {error}=await apiRequest('/auth/password',{
    method:'POST',
    body:JSON.stringify({currentPassword:current,nextPassword:next})
  });
  if(error) return alert('Erreur : '+error.message);
  UI.currentUser={...UI.currentUser,must_change_password:false};
  const idx=D.users.findIndex(u=>u.id===UI.currentUser.id);
  if(idx>=0) D.users[idx]={...D.users[idx],must_change_password:false};
  closeModal();
  notify('success','Mot de passe mis à jour.');
}

async function saveExo(){
  const lib=document.getElementById('exo-lib').value.trim();
  const deb=document.getElementById('exo-deb').value;
  const fin=document.getElementById('exo-fin').value;
  if(!lib||!deb||!fin)return alert('Tous les champs sont obligatoires');
  return createExo({libelle:lib,date_debut:deb,date_fin:fin},true);
}

async function createExo(payload,archiveActive){
  const lib=payload.libelle?.trim();
  const deb=payload.date_debut;
  const fin=payload.date_fin;
  if(!lib||!deb||!fin)return alert('Tous les champs sont obligatoires');
  if(archiveActive){
    const actifs=D.exercices.filter(e=>e.statut==='actif');
    if(actifs.length){
      const ids=actifs.map(e=>e.id);
      const {error:archiveError}=await SB.from('exercices').update({statut:'archive'}).in('id',ids);
      if(archiveError)return alert('Erreur : '+archiveError.message);
      D.exercices=D.exercices.map(e=>ids.includes(e.id)?{...e,statut:'archive'}:e);
    }
  }
  const {data,error}=await SB.from('exercices').insert({libelle:lib,date_debut:deb,date_fin:fin,statut:'actif'}).select().single();
  if(error)return alert('Erreur : '+error.message);
  D.exercices.unshift(data);
  refreshCurrentExo();
  closeModal();render();
  return data;
}

async function finalizeExoClose(id){
  const exo=D.exercices.find(e=>e.id===id);
  if(!exo) return;
  const diag=exerciceDiagnostics(exo.id);
  if(diag.ecartJournal!==0) return alert('L’exercice n’est pas équilibré. Régularisez-le avant de le clôturer.');
  const doReport=document.getElementById('exo-close-report')?.checked;
  const doNext=document.getElementById('exo-close-next')?.checked;
  if(doReport&&Math.abs(diag.resultat)>=0.01){
    const prefix=`CLO-${String(exo.id).slice(0,8)}`;
    try{
      await deleteJournalPiecePrefix(prefix);
      await insertJournalRows([
        {date_op:exo.date_fin||td(),piece:`${prefix}-RES1`,compte:diag.resultat>=0?'1200 - Résultat de l exercice excédent':'1290 - Résultat de l exercice déficit',libelle:`Clôture résultat - ${exo.libelle}`,debit:diag.resultat>=0?Math.abs(diag.resultat):0,credit:diag.resultat<0?Math.abs(diag.resultat):0,exercice_id:exo.id},
                              {date_op:exo.date_fin||td(),piece:`${prefix}-RES2`,compte:'1060 - Réserves',libelle:`Affectation résultat - ${exo.libelle}`,debit:diag.resultat<0?Math.abs(diag.resultat):0,credit:diag.resultat>=0?Math.abs(diag.resultat):0,exercice_id:exo.id}
      ]);
    }catch(error){
      return alert('Erreur lors du report du résultat : '+error.message);
    }
  }
  const payload={statut:'cloture',date_cloture:new Date().toISOString()};
  const {error}=await SB.from('exercices').update(payload).eq('id',id);
  if(error) return alert('Erreur : '+error.message);
  D.exercices=D.exercices.map(e=>e.id===id?{...e,...payload}:e);
  if(doNext){
    const nextPayload={libelle:document.getElementById('exo-next-lib').value.trim(),date_debut:document.getElementById('exo-next-deb').value,date_fin:document.getElementById('exo-next-fin').value};
    const created=await createExo(nextPayload,false);
    if(!created) return;
  }else{
    refreshCurrentExo();
    closeModal();
    render();
  }
}

async function saveClub(){
  if(!requireWritePerm('perm_administration')) return;
  const g=n=>document.getElementById(n)?.value||'';
  const ups=[{cle:'nom',valeur:g('ci-nom')},{cle:'adresse',valeur:g('ci-adr')},{cle:'telephone',valeur:g('ci-tel')},{cle:'email',valeur:g('ci-email')},{cle:'siret',valeur:g('ci-siret')},{cle:'ape',valeur:g('ci-ape')}];
  await SB.from('club_info').upsert(ups,{onConflict:'cle'});
  ups.forEach(u=>D.clubInfo[u.cle]=u.valeur);
  document.getElementById('hdr-nom').textContent=D.clubInfo.nom;
  alert('Infos club sauvegardées !');
}

// ═══════════════════════════════════════════════════
// BANQUE
// ═══════════════════════════════════════════════════
async function importBankCSV(e){
  const file=e.target.files[0];if(!file)return;
  const cid=document.getElementById('cible-cpt')?.value;
  const c=D.comptes.find(x=>x.id===cid);if(!c)return;
  const r=new FileReader();
  r.onload=async ev=>{
    const lines=ev.target.result.split(/\r?\n/).filter(l=>l.trim());
    const existing=new Set((c.transactions||[]).map(transactionFingerprint));
    const rows=[];
    lines.slice(1).forEach(line=>{
      const cols=line.split(';').map(x=>x.trim().replace(/"/g,''));
      if(cols.length<4)return;
      const row={compte_id:cid,date_op:cols[0],libelle:cols[1],debit:parseFloat((cols[2]||'0').replace(',','.').replace('-','0'))||0,credit:parseFloat((cols[3]||'0').replace(',','.').replace('-','0'))||0,rapproche:false,source_document:'credit_mutuel_csv',source_format:'csv'};
      const fp=transactionFingerprint(row);
      if(existing.has(fp)) return;
      existing.add(fp);
      rows.push(row);
    });
    if(!rows.length)return alert('Aucune ligne valide ou toutes les opérations existent déjà.');
    const {data,error}=await SB.from('transactions').upsert(rows,{onConflict:['compte_id','date_op','libelle','debit','credit']}).select();
    if(error)return alert('Erreur : '+error.message);
    // Fusionner sans doublons en mémoire (l'upsert peut retourner des lignes déjà existantes)
    const existingIds=new Set((c.transactions||[]).map(t=>t.id));
    const newTx=(data||[]).filter(t=>!existingIds.has(t.id));
    c.transactions=[...(c.transactions||[]),...newTx].sort((a,b)=>compareFrDates(b.date_op,a.date_op));
    alert(`${newTx.length} nouvelle(s) transaction(s) importée(s) !`);render();
  };
  r.readAsText(file,'ISO-8859-1');
  e.target.value='';
}

async function readPdfPages(file){
  if(typeof pdfjsLib==='undefined') throw new Error('La bibliothèque PDF.js n est pas chargée.');
  const bytes=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:bytes}).promise;
  const pages=[];
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i);
    const content=await page.getTextContent();
    const lines=new Map();
    content.items.forEach(it=>{
      const x=it.transform?.[4]||0;
      const y=Math.round((it.transform?.[5]||0)*2)/2;
      // Ignore le filigrane vertical de fond imprimé dans la marge gauche
      // (ex: "HT.20260601.051243.5001.0084.1000 X 0 2"). Ces fragments tombent
      // parfois sur le même Y qu'une ligne d'opération du tableau et, sans ce
      // filtre, viennent polluer le début de la ligne reconstituée et empêcher
      // la détection de la date d'opération.
      if(x<30 && !/\d{2}\/\d{2}\/\d{4}/.test(it.str||'')) return;
      if(!lines.has(y)) lines.set(y,[]);
      lines.get(y).push({x,str:it.str||'',width:it.width||0});
    });
    const ordered=[...lines.entries()].sort((a,b)=>b[0]-a[0]);
    const pageLines=ordered.map(([y,items])=>{
      items.sort((a,b)=>a.x-b.x);
      let line='';
      let prevX=0;
      items.forEach((it,idx)=>{
        const gap=idx===0?0:Math.max(1,Math.round((it.x-prevX)/6));
        line += (idx===0?'':' '.repeat(Math.min(gap,20))) + it.str;
        prevX=it.x + (it.str||'').length*3.2;
      });
      return {y,text:line.replace(/\s+$/,''),items};
    });
    pages.push({pageNumber:i,lines:pageLines});
  }
  return pages;
}

function pagesToText(pages){
  return pages.map(p=>p.lines.map(l=>l.text).join('\n')).join('\n');
}

function numFr(v){
  if(!v) return 0;
  const s=(v+'').replace(/\s+/g,'').replace(/\./g,'').replace(',', '.');
  const n=parseFloat(s);
  return Number.isFinite(n)?n:0;
}

function normalizeLine(s){
  return s.replace(/\s+/g,' ').trim();
}

// Extrait le total officiel "Total des mouvements" annoncé par le relevé (débit, crédit),
// pour permettre de vérifier après coup que le parseur n'a rien fusionné ni perdu.
function extractStatementTotals(text){
  const lines=text.split(/\r?\n/).map(normalizeLine).filter(Boolean);
  for(const line of lines){
    if(/total des mouvements/i.test(line)){
      const amounts=line.match(/-?\d{1,3}(?:[ .]\d{3})*,\d{2}|-?\d+,\d{2}/g)||[];
      if(amounts.length>=2) return {debit:numFr(amounts[0]),credit:numFr(amounts[1])};
      if(amounts.length===1) return {debit:numFr(amounts[0]),credit:null};
    }
  }
  return null;
}

function parseCreditMutuelPdfText(text){
  const lines=text.split(/\r?\n/).map(normalizeLine).filter(Boolean);
  const rows=[];
  let lastRow=null;
  const stopMeta=/^HT\.|^QXBAN|^IBAN|^Vous disposez|^Alerte|^Attention|^Information sur la protection|^Sous réserve|^CAISSE DE CREDIT MUTUEL|^TVA intracommunautaire|^Médiateur du Crédit Mutuel|^Pour toute demande|^<<Suite|^Suite au verso|^Réf\s*:\s*\d+\s+SOLDE|^RELEVE ET INFORMATIONS BANCAIRES|^Caisse \d|^C\/C |^TITULAIRE/i;

  function inferBankSide(libelle){
    const t=(libelle||'').toUpperCase();
    if(/VIR EPARGNE|PASSEPORT SPOR|FULL FIGHTING|VIR ACHAT|ACHAT | ACHAT|PRLV|FACT|MULTI ASSO|CARTE|CB |COTIS\.|VIR SEPA|CHEQUE|CHQ|FRAIS|TEL(E|É)COM|BOUYGUES|ORANGE|SFR/.test(t)) return 'debit';
    if(/VIR DE|VIR INST|VERSEMENT|REMISE|SOUTIEN|SUBVENTION|HELLOASSO|COTISATION|PASSAGE CEINTURE/.test(t)) return 'credit';
    return 'credit';
  }

  function extractAmounts(str){
    const out=[];
    const re=/(?:^|[^\d])(-?\d{1,3}(?:[ .]\d{3})*,\d{2}|-?\d+,\d{2})(?!\d)/g;
    let m;
    while((m=re.exec(str))!==null) out.push(m[1]);
    return out;
  }

  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(/solde crediteur|solde débiteur|releve et informations bancaires|iban|page \d+/i.test(line) || stopMeta.test(line)){
      if(stopMeta.test(line)) lastRow=null;
      continue;
    }
    if(lastRow && !/^\d{2}\/\d{2}\/\d{4}\b/.test(line) && !/solde crediteur|total des mouvements|iban|qxban|information sur la protection/i.test(line) && !stopMeta.test(line)){
      if(!/^\d[\d.\s]*,\d{2}$/.test(line)) lastRow.libelle += ` ${line}`;
      continue;
    }
    const m=line.match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(.+?)$/);
    if(!m) continue;
    const dateOp=m[1];
    const dateValeur=m[2];
    let rest=m[3].trim();
    let debit=0,credit=0;

    const trailingAmounts=extractAmounts(rest);
    if(trailingAmounts.length>=2){
      const a=trailingAmounts.slice(-2).map(numFr);
      debit=a[0]||0;
      credit=a[1]||0;
      rest=rest.replace(/\s*(?:-?\d{1,3}(?:[ .]\d{3})*,\d{2}|-?\d+,\d{2})\s*(?:-?\d{1,3}(?:[ .]\d{3})*,\d{2}|-?\d+,\d{2})\s*$/,'').trim();
    }else if(trailingAmounts.length===1){
      const amount=numFr(trailingAmounts[0]);
      rest=rest.replace(/\s*(?:-?\d{1,3}(?:[ .]\d{3})*,\d{2}|-?\d+,\d{2})\s*$/,'').trim();
      if(inferBankSide(rest)==='debit') debit=amount; else credit=amount;
    }else{
      let amount=0;
      for(let j=i+1;j<Math.min(lines.length,i+6);j++){
        const next=lines[j]||'';
        if(/^R[ée]f\s*:|^Ref\s*:/i.test(next)){
          rest+=` ${next}`;
          i=j;
          continue;
        }
        if(stopMeta.test(next)) break;
        if(/^-?\d[\d.\s]*,\d{2}$/.test(next)){
          amount=numFr(next);
          i=j;
          break;
        }
        if(/^\d{2}\/\d{2}\/\d{4}\b/.test(next) || /solde crediteur|solde débiteur|total des mouvements/i.test(next)) break;
        if(next && !/qxban|iban|information sur la protection/i.test(next)) rest+=` ${next}`;
      }
      if(!amount) continue;
      if(inferBankSide(rest)==='debit') debit=amount; else credit=amount;
    }
    lastRow={
      date_op:dateOp,
      date_valeur:frDateToISO(dateValeur),
      libelle:rest || 'Opération importée depuis PDF Crédit Mutuel',
      debit,
      credit,
      rapproche:false,
      source_document:'credit_mutuel_pdf',
      source_format:'pdf'
    };
    rows.push(lastRow);
  }
  return rows;
}

function parseCreditMutuelPdfPages(pages){
  const rows=[];
  const stopMeta=/^HT\.|^QXBAN|^IBAN|^Vous disposez|^Alerte|^Attention|^Information sur la protection|^Sous réserve|^CAISSE DE CREDIT MUTUEL|^TVA intracommunautaire|^Médiateur du Crédit Mutuel|^Pour toute demande|^<<Suite|^Suite au verso|^Réf\s*:\s*\d+\s+SOLDE|^RELEVE ET INFORMATIONS BANCAIRES|^Caisse \d|^C\/C |^TITULAIRE/i;
  let debitX=null,creditX=null;

  function isAmountStr(s){
    return /^-?\d{1,3}(?:[ .]\d{3})*,\d{2}$|^-?\d+,\d{2}$/.test(normalizeLine(s));
  }

  function findAmountItems(items){
    return items
    .filter(it=>isAmountStr(it.str))
    .map(it=>({value:numFr(it.str),x:(it.x||0)+((it.width||0)/2),raw:it.str}));
  }

  // Calibrage : chercher les colonnes Débit/Crédit sur toutes les pages
  for(const page of pages){
    for(const line of page.lines){
      const txt=normalizeLine(line.text);
      if(!txt) continue;
      if(txt.includes('Débit EUROS')){
        const debitItem=line.items.find(it=>/Débit/i.test(it.str));
        if(debitItem) debitX=(debitItem.x||0)+((debitItem.width||0)/2);
      }
      if(txt.includes('Crédit EUROS')){
        const creditItem=line.items.find(it=>/Crédit|Credit/i.test(it.str));
        if(creditItem) creditX=(creditItem.x||0)+((creditItem.width||0)/2);
      }
    }
  }

  // Construire un index Y→items pour retrouver les montants sur des lignes Y proches
  // (pdf.js peut séparer le libellé et le montant si leurs Y diffèrent légèrement)
  function buildPageItemIndex(page){
    const index=new Map();
    for(const line of page.lines){
      for(const it of line.items){
        if(!isAmountStr(it.str)) continue;
        const y=line.y;
        if(!index.has(y)) index.set(y,[]);
        index.get(y).push({value:numFr(it.str),x:(it.x||0)+((it.width||0)/2),raw:it.str,y});
      }
    }
    return index;
  }

  // Chercher des montants dans un rayon Y de ±4 unités autour d'un Y de référence
  function findAmountItemsNearY(itemIndex,refY,tolerance=4){
    const found=[];
    for(const [y,items] of itemIndex.entries()){
      if(Math.abs(y-refY)<=tolerance) found.push(...items);
    }
    return found;
  }

  for(const page of pages){
    const itemIndex=buildPageItemIndex(page);
    let current=null;
    for(const line of page.lines){
      const txt=normalizeLine(line.text);
      if(!txt) continue;
      if(/solde crediteur|solde débiteur|releve et informations bancaires|iban|page \d+|total des mouvements/i.test(txt) || stopMeta.test(txt)){
        if(stopMeta.test(txt)) current=null;
        continue;
      }
      const m=txt.match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(.+?)$/);
      if(m){
        // Chercher d'abord dans les items de la ligne, puis dans le voisinage Y
        let amountItems=findAmountItems(line.items);
        if(!amountItems.length) amountItems=findAmountItemsNearY(itemIndex,line.y,4);

        let rest=m[3].trim();
        // Nettoyer les montants qui auraient été inclus dans le libellé
        rest=rest.replace(/\s*(?:-?\d{1,3}(?:[ .]\d{3})*,\d{2}|-?\d+,\d{2})(\s+(?:-?\d{1,3}(?:[ .]\d{3})*,\d{2}|-?\d+,\d{2}))*\s*$/,'').trim();

        let debit=0,credit=0;

        if(amountItems.length>=2){
          // Trier par position X : le plus à gauche = débit, le plus à droite = crédit
          const sorted=amountItems.sort((a,b)=>a.x-b.x);
          if(debitX!=null && creditX!=null){
            // Assigner selon proximité aux colonnes calibrées
            for(const ai of sorted){
              const dx=Math.abs(ai.x-debitX);
              const cx=Math.abs(ai.x-creditX);
              if(dx<=cx) debit=ai.value; else credit=ai.value;
            }
          }else{
            debit=sorted[0].value||0;
            credit=sorted[sorted.length-1].value||0;
          }
        }else if(amountItems.length===1){
          const amount=amountItems[0].value||0;
          if(debitX!=null && creditX!=null){
            const dx=Math.abs(amountItems[0].x-debitX);
            const cx=Math.abs(amountItems[0].x-creditX);
            if(dx<=cx) debit=amount; else credit=amount;
          }else{
            // Fallback : inférer débit/crédit par le libellé
            const side=((t)=>{
              const u=t.toUpperCase();
              if(/VIR EPARGNE|PASSEPORT SPOR|VIR ACHAT|PRLV|FACT|VIR SEPA|BOUYGUES|OVH|CHEQUE|FRAIS|CARTE|CB |MULTI ASSO/.test(u)) return 'debit';
              if(/SOUTIEN|VIR DE|VIR INST|VERSEMENT|REMISE|SUBVENTION|HELLOASSO/.test(u)) return 'credit';
              return 'debit';
            })(rest);
            if(side==='debit') debit=amount; else credit=amount;
          }
        }else{
          // Aucun montant trouvé même dans le voisinage : créer la transaction sans montant
          // pour ne pas la perdre — le montant sera cherché dans les lignes suivantes
          current={date_op:m[1],date_valeur:frDateToISO(m[2]),libelle:rest||'Opération importée depuis PDF Crédit Mutuel',debit:0,credit:0,_pendingAmount:true,rapproche:false,source_document:'credit_mutuel_pdf',source_format:'pdf'};
          rows.push(current);
          continue;
        }
        current={date_op:m[1],date_valeur:frDateToISO(m[2]),libelle:rest||'Opération importée depuis PDF Crédit Mutuel',debit,credit,rapproche:false,source_document:'credit_mutuel_pdf',source_format:'pdf'};
        rows.push(current);
        continue;
      }
      if(current && !stopMeta.test(txt) && !/solde crediteur|total des mouvements|iban|qxban|information sur la protection/i.test(txt)){
        // Si montant isolé sur sa propre ligne et transaction en attente de montant
        if(current._pendingAmount && isAmountStr(txt)){
          const amount=numFr(txt);
          // Trouver la position X de cet item pour savoir si débit ou crédit
          const amtItem=line.items.find(it=>isAmountStr(it.str));
          const amtX=amtItem?((amtItem.x||0)+((amtItem.width||0)/2)):null;
          if(debitX!=null && creditX!=null && amtX!=null){
            const dx=Math.abs(amtX-debitX);
            const cx=Math.abs(amtX-creditX);
            if(dx<=cx) current.debit=amount; else current.credit=amount;
          }else{
            const u=current.libelle.toUpperCase();
            if(/VIR EPARGNE|PASSEPORT SPOR|VIR ACHAT|PRLV|FACT|VIR SEPA|BOUYGUES|OVH|CHEQUE|FRAIS|CARTE|CB |MULTI ASSO/.test(u)) current.debit=amount;
            else current.credit=amount;
          }
          delete current._pendingAmount;
        }else if(!/^-?\d[\d.\s]*,\d{2}$/.test(txt)){
          current.libelle += ` ${txt}`;
        }
      }
    }
  }
  // Retirer les transactions sans montant résolues ni résoluble (montant = 0 des deux côtés non intentionnel)
  const cleaned=rows.filter(r=>{ delete r._pendingAmount; return r.debit!==0||r.credit!==0; });

  // Marque comme "à vérifier" les lignes présentant un signal de risque connu :
  // - présence d'un second motif date+date ou d'un second bloc ICS/RUM dans le
  //   libellé => signe quasi certain que deux opérations ont été fusionnées
  //   (un libellé SEPA légitime ne contient jamais deux fois ces blocs)
  // - mention d'un regroupement de paiements CB (le Crédit Mutuel regroupe les
  //   paiements <10€ chez un même commerçant ; un seul montant peut alors
  //   représenter plusieurs opérations distinctes, à ne pas rapprocher comme une seule)
  const groupedCardPattern=/regroup|plusieurs paiements|paiements? cb \d|cumul.*carte|carte.*cumul/i;
  function countOccurrences(str,re){ return ((str||'').match(re)||[]).length; }
  cleaned.forEach(r=>{
    const reasons=[];
    if(/\d{2}\/\d{2}\/\d{4}\s+\d{2}\/\d{2}\/\d{4}/.test(r.libelle||'')) reasons.push('Le libellé contient une deuxième date d’opération : deux opérations ont probablement été fusionnées.');
    if(countOccurrences(r.libelle,/\bICS\s*:/gi)>1 || countOccurrences(r.libelle,/\bRUM\s*:/gi)>1) reasons.push('Le libellé contient deux références SEPA (ICS/RUM) : deux opérations ont probablement été fusionnées.');
    if(groupedCardPattern.test(r.libelle||'')) reasons.push('Possible paiements CB regroupés (< 10 €, même commerçant) : un seul montant peut représenter plusieurs opérations.');
    if(reasons.length){ r.a_verifier=true; r.a_verifier_raison=reasons.join(' '); }
  });

  return cleaned;
}


function extractAccountNumber(text){
  // C/C Connect Asso N° 00020806601  ou  LIVRET BLEU ASSOCIATION N° 00020806603
  const m = text.match(/N[°º]\s*(\d{8,14})/i);
  return m ? m[1].replace(/\s+/g,'') : null;
}

async function importBankPDF(e){
  const file=e.target.files[0];
  if(!file) return;
  const cid=document.getElementById('cible-cpt')?.value;
  const c=D.comptes.find(x=>x.id===cid);
  e.target.value='';
  if(!c) return alert('Compte cible obligatoire.');
  try{
    const pages=await readPdfPages(file);
    const text=pagesToText(pages);
    // ── Détection automatique du compte bancaire dans le PDF ──
    const pdfAccountNum=extractAccountNumber(text);
    if(pdfAccountNum){
      // Chercher un compte dont le numéro contient le numéro détecté
      const matched=D.comptes.find(x=>(x.numero||'').replace(/\s+/g,'').includes(pdfAccountNum)||pdfAccountNum.includes((x.numero||'').replace(/\s+/g,'')));
      if(matched && matched.id!==cid){
        const ok=confirm(`⚠️ Le PDF appartient au compte "${matched.nom}" (N° ${pdfAccountNum}), mais vous avez sélectionné "${c.nom}".\n\nCliquez OK pour basculer automatiquement sur le bon compte, ou Annuler pour conserver votre choix.`);
        if(ok){
          // Mettre à jour le select et la variable locale
          const sel=document.getElementById('cible-cpt');
          if(sel) sel.value=matched.id;
          // Relancer avec le bon compte — on réaffecte cid/c
          return importBankPDFWithAccount(file, matched.id);
        }
      } else if(!matched){
        // Numéro détecté mais aucun compte enregistré ne correspond
        const ok=confirm(`ℹ️ Le PDF mentionne le compte N° ${pdfAccountNum} qui ne correspond à aucun compte enregistré.\n\nImporter quand même dans "${c.nom}" ?`);
        if(!ok) return;
      }
    }
    return importBankPDFWithAccount(file, cid);
  }catch(err){
    alert('Import PDF impossible : '+err.message);
  }
}

async function importBankPDFWithAccount(file, cid){
  const c=D.comptes.find(x=>x.id===cid);
  if(!c) return alert('Compte cible introuvable.');
  try{
    const pages=await readPdfPages(file);
    const text=pagesToText(pages);
    const parsedRows=parseCreditMutuelPdfPages(pages);
    const usedFallback=!parsedRows.length;
    const existing=new Set((c.transactions||[]).map(transactionFingerprint));
    const parsed=(parsedRows.length?parsedRows:parseCreditMutuelPdfText(text))
    .map(r=>({...r,compte_id:cid}));
    const seen=new Set();
    const dedup=[];
    let skippedDuplicates=0;
    parsed.forEach(r=>{
      const fp=transactionFingerprint(r);
      if(existing.has(fp)||seen.has(fp)){ skippedDuplicates++; return; }
      seen.add(fp);
      dedup.push(r);
    });
    if(!dedup.length) return alert('Aucune opération exploitable détectée dans ce PDF, ou toutes les opérations sont déjà importées.');
    const officialTotals=extractStatementTotals(text);
    UI.bankPreview={cid,rows:dedup,officialTotals,skippedDuplicates,usedFallback};
    UI.modal='bank_preview';
    renderModal();
  }catch(err){
    alert('Import PDF impossible : '+err.message);
  }
}

async function confirmBankImport(){
  const preview=UI.bankPreview;
  if(!preview) return;
  const c=D.comptes.find(x=>x.id===preview.cid);
  if(!c) return alert('Compte cible introuvable.');
  const rows=preview.rows.map(r=>{ const {a_verifier,a_verifier_raison,...rest}=r; return rest; });
  const {data,error}=await SB.from('transactions').upsert(rows,{onConflict:['compte_id','date_op','libelle','debit','credit']}).select();
  if(error) return alert('Erreur : '+error.message);
  const existingIds=new Set((c.transactions||[]).map(t=>t.id));
  const newTx=(data||[]).filter(t=>!existingIds.has(t.id));
  c.transactions=[...(c.transactions||[]),...newTx].sort((a,b)=>compareFrDates(b.date_op,a.date_op));
  UI.bankPreview=null;
  closeModal();
  render();
  alert(`${newTx.length} nouvelle(s) transaction(s) importée(s) depuis le PDF.`);
}

function cancelBankImport(){
  UI.bankPreview=null;
  closeModal();
}

async function rapprocher(id,i){
  const ecr=document.getElementById(`ecr-${i}`);
  const piece=ecr?ecr.value:'';
  if(!piece){ notify('warn','Sélectionnez une écriture avant de rapprocher.','Rapprochement'); return; }
  await SB.from('transactions').update({rapproche:true,ecriture_piece:piece,ecriture_pieces_json:JSON.stringify([piece])}).eq('id',id);
  const t=D.comptes.flatMap(c=>c.transactions||[]).find(x=>x.id===id);
  if(t){t.rapproche=true;t.ecriture_piece=piece;t.ecriture_pieces_json=JSON.stringify([piece]);}
  render();
}

// Rapprochement multi-pièces : une transaction bancaire ↔ N écritures comptables
// Cas typiques : remise de chèques groupée, virement regroupant plusieurs cotisations
async function rapprocherMulti(id){
  const sel=UI.rapprMultiSel[id]||[];
  if(!sel.length){ notify('warn','Sélectionnez au moins une écriture.','Multi-rapprochement'); return; }
  const piecesJson=JSON.stringify(sel);
  const firstPiece=sel[0];
  await SB.from('transactions').update({rapproche:true,ecriture_piece:firstPiece,ecriture_pieces_json:piecesJson}).eq('id',id);
  const t=D.comptes.flatMap(c=>c.transactions||[]).find(x=>x.id===id);
  if(t){t.rapproche=true;t.ecriture_piece=firstPiece;t.ecriture_pieces_json=piecesJson;}
  delete UI.rapprMultiSel[id];
  notify('success',`Transaction rapprochée avec ${sel.length} écriture(s).`,'Multi-rapprochement');
  render();
}

// Rapprochement groupé validé depuis le panneau de suggestion
async function validerGroupeRapprochement(transactionIds, piece){
  if(!confirm(`Rapprocher les ${transactionIds.length} transactions avec la pièce ${piece} ?`)) return;
  const piecesJson=JSON.stringify([piece]);
  for(const tid of transactionIds){
    await SB.from('transactions').update({rapproche:true,ecriture_piece:piece,ecriture_pieces_json:piecesJson}).eq('id',tid);
    const t=D.comptes.flatMap(c=>c.transactions||[]).find(x=>x.id===tid);
    if(t){t.rapproche=true;t.ecriture_piece=piece;t.ecriture_pieces_json=piecesJson;}
  }
  notify('success',`${transactionIds.length} transaction(s) rapprochées avec la pièce ${piece}.`,'Rapprochement groupé');
  render();
}

function toggleMultiSel(tid, piece){
  if(!UI.rapprMultiSel[tid]) UI.rapprMultiSel[tid]=[];
  const idx=UI.rapprMultiSel[tid].indexOf(piece);
  if(idx>=0) UI.rapprMultiSel[tid].splice(idx,1);
  else UI.rapprMultiSel[tid].push(piece);
  render();
}

async function modifierRapprochement(id){
  if(!confirm('Modifier le rapprochement de cette transaction ? Elle repassera en attente et vous pourrez choisir une nouvelle écriture.')) return;
  await SB.from('transactions').update({rapproche:false,ecriture_piece:null,ecriture_pieces_json:null}).eq('id',id);
  const t=D.comptes.flatMap(c=>c.transactions||[]).find(x=>x.id===id);
  if(t){t.rapproche=false;t.ecriture_piece=null;t.ecriture_pieces_json=null;}
  notify('info','Transaction repassée en attente — choisissez la bonne écriture.','Rapprochement');
  render();
}
// ─── Rapprochement — scoring multi-critères ───────────────────────────────
// Score max = 5 points
//   +2  montant identique à ±0.01 €
//   +1  montant proche à ±1 €
//   +1  date dans les 3 jours (bonus si ≤7 jours)
//   +1  libellé contient un mot commun significatif (≥4 caractères)
//   +0.5 sens cohérent (débit tx ↔ débit journal, crédit tx ↔ crédit journal)
// Seuil rapprochement automatique : score ≥ 3.5
// Seuil suggestion manuelle      : score ≥ 1.5
const RAPPR_AUTO_THRESHOLD   = 3.5;
const RAPPR_SUGGEST_THRESHOLD = 1.5;

// Mots-parasites fréquents dans les libellés bancaires qui n'apportent aucune
// information de matching (codes opérateur, mentions génériques de virement...)
// On les retire avant comparaison pour ne pas polluer le score de libellé.
const RAPPR_STOPWORDS = new Set([
  'virement','vir','carte','paiement','prelevement','prélèvement','cb',
  'reference','référence','ref','operation','opération','date','valeur',
  'compte','vers','depuis','recu','reçu','helloasso','sepa','achat','frais'
]);

function normalizeLibelleWords(libelle){
  return (libelle||'')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'') // retire les accents pour un matching plus robuste
    .replace(/\d{4,}/g,' ') // retire les longues suites de chiffres (références, n° d'opération)
    .split(/\W+/)
    .filter(w=>w.length>=4 && !RAPPR_STOPWORDS.has(w));
}

function scoreRapprochement(transaction, entry){
  let score = 0;
  const txAmount  = Math.max(+transaction.credit||0, +transaction.debit||0);
  const entAmount = Math.max(+entry.credit||0, +entry.debit||0);
  const diff = Math.abs(entAmount - txAmount);
  if(diff < 0.01)       score += 2;
  else if(diff <= 1.00) score += 1;
  else if(diff > txAmount * 0.10) return 0; // écart >10% → éliminé d'office

  const txDate  = new Date(frDateToISO(transaction.date_op) || transaction.date_op || '');
  const entDate = new Date(entry.date_op || '');
  if(!isNaN(txDate) && !isNaN(entDate)){
    const deltaDays = Math.abs(txDate - entDate) / (1000*60*60*24);
    if(deltaDays <= 3)      score += 1;
    else if(deltaDays <= 7) score += 0.5;
    else if(deltaDays > 31) return 0; // trop loin dans le temps → éliminé
  }

  // Sens débit/crédit cohérent
  const txIsDebit   = (+transaction.debit||0) > 0;
  const entIsDebit  = (+entry.debit||0) > 0;
  if(txIsDebit === entIsDebit) score += 0.5;

  // Matching libellé — mots significatifs en commun, nettoyés des parasites bancaires
  const txWords  = normalizeLibelleWords(transaction.libelle);
  const entWords = normalizeLibelleWords(entry.libelle);
  const common   = txWords.filter(w=>entWords.includes(w));
  if(common.length >= 2)      score += 1;
  else if(common.length === 1) score += 0.5;

  return score;
}

// Pièces déjà associées à une transaction rapprochée : on les exclut des
// suggestions pour éviter qu'une même écriture serve deux fois (montants
// identiques récurrents type cotisations à tarif fixe, dons mensuels...).
function consumedPieces(){
  const consumed = new Set();
  D.comptes.flatMap(c=>c.transactions||[]).forEach(t=>{
    if(!t.rapproche) return;
    if(t.ecriture_piece) consumed.add(t.ecriture_piece);
    if(t.ecriture_pieces_json){
      try{ JSON.parse(t.ecriture_pieces_json).forEach(p=>consumed.add(p)); }catch(e){}
    }
  });
  return consumed;
}

function suggestRapprochementPiece(transaction){
  const result = bestRapprochementEntry(transaction);
  return result?.entry?.piece || '';
}

function bestRapprochementEntry(transaction, excludePieces=null){
  const excluded = excludePieces || consumedPieces();
  let best = null;
  let bestScore = 0;
  for(const entry of D.journal){
    if(!entry.piece && !entry.id) continue;
    const pieceKey = entry.piece || entry.id.slice(0,8);
    if(excluded.has(pieceKey)) continue; // déjà consommée par un autre rapprochement
    const score = scoreRapprochement(transaction, entry);
    if(score > bestScore){ bestScore = score; best = entry; }
  }
  if(bestScore < RAPPR_SUGGEST_THRESHOLD) return null;
  return { entry: best, score: bestScore, auto: bestScore >= RAPPR_AUTO_THRESHOLD };
}

// ─── Rapprochement groupé (plusieurs transactions ↔ une même pièce) ───────
// Cas typiques : remise de chèques groupée, virement HelloAsso groupant N adhésions,
// tout virement bancaire unique correspondant à plusieurs écritures comptables.
// Algorithme subset-sum généralisé (max 10 transactions par groupe pour rester performant).
function findSubsetSum(pool, target, maxSize=10){
  const results=[];
  function recurse(start, current, sum){
    if(Math.abs(sum-target)<0.02 && current.length>1){
      results.push([...current]);
    }
    if(current.length>=maxSize||start>=pool.length) return;
    for(let i=start;i<pool.length;i++){
      const amount=(+pool[i].credit||0)+(+pool[i].debit||0);
      if(sum+amount<=target+0.02){
        recurse(i+1,[...current,pool[i]],sum+amount);
      }
    }
  }
  recurse(0,[],0);
  return results;
}

function findGroupedRapprochement(transactions){
  const byPiece = {};
  D.journal.forEach(j=>{
    const key = j.piece || j.id.slice(0,8);
    if(!byPiece[key]) byPiece[key] = { piece:key, rows:[], amount:0, date:j.date_op };
    byPiece[key].rows.push(j);
    byPiece[key].amount += (+j.credit||0) - (+j.debit||0);
  });
  const consumed = consumedPieces();
  const candidates = Object.values(byPiece).filter(g=>!consumed.has(g.piece) && Math.abs(g.amount)>=0.01);

  const results = [];
  const pool = transactions.filter(t=>!t.rapproche);
  for(const group of candidates){
    const groupAmount = Math.abs(group.amount);
    // Cherche tous les sous-ensembles de transactions non rapprochées dont la somme colle
    const subsets = findSubsetSum(pool, groupAmount);
    for(const subset of subsets){
      // Évite les doublons (même ensemble de transactions, pièce différente)
      const key = subset.map(t=>t.id).sort().join(',');
      if(!results.find(r=>r.transactionIds.slice().sort().join(',')===key && r.piece===group.piece)){
        results.push({
          piece: group.piece,
          transactionIds: subset.map(t=>t.id),
          transactions: subset,
          amount: groupAmount,
          nbTx: subset.length
        });
      }
    }
  }
  return results;
}

async function preselectRapprochements(){
  const transactions = D.comptes.flatMap(c=>c.transactions||[]);
  const toAutoRapproch = [];
  const excluded = consumedPieces(); // mutée localement pour éviter d'attribuer deux fois la même pièce dans cette même passe
  let nbAuto = 0; let nbSuggest = 0;

  transactions.forEach((transaction, index)=>{
    if(transaction.rapproche) return;
    const result = bestRapprochementEntry(transaction, excluded);
    if(!result) return;
    const piece = result.entry.piece || result.entry.id.slice(0,8);
    if(result.auto){
      // Haute confiance → on marque pour rapprochement automatique
      toAutoRapproch.push({ id: transaction.id, piece, transaction, index });
      excluded.add(piece); // ne plus la proposer aux transactions suivantes de cette passe
      nbAuto++;
    } else {
      // Confiance moyenne → pré-sélection manuelle uniquement
      const select = document.getElementById(`ecr-${index}`);
      if(select){ select.value = piece; nbSuggest++; }
    }
  });

  const grouped = findGroupedRapprochement(transactions);
  const nbGrouped = grouped.length;

  // Rapprochement automatique en base pour les matches haute confiance
  if(toAutoRapproch.length){
    const confirmed = confirm(
      `${nbAuto} transaction(s) ont un match fiable et seront rapprochées automatiquement.\n` +
      `${nbSuggest} autre(s) ont été pré-sélectionnées pour validation manuelle.\n` +
      (nbGrouped?`${nbGrouped} regroupement(s) possible(s) détecté(s) (ex: virement groupé HelloAsso) — à valider manuellement dans l'onglet Rapprochement groupé.\n`:'') +
      `\nConfirmer le rapprochement automatique ?`
    );
    if(confirmed){
      for(const item of toAutoRapproch){
        await SB.from('transactions').update({rapproche:true, ecriture_piece:item.piece, ecriture_pieces_json:JSON.stringify([item.piece])}).eq('id',item.id);
        const t = D.comptes.flatMap(c=>c.transactions||[]).find(x=>x.id===item.id);
        if(t){ t.rapproche=true; t.ecriture_piece=item.piece; t.ecriture_pieces_json=JSON.stringify([item.piece]); }
      }
      notify('success',
             `${nbAuto} rapprochement(s) automatique(s) effectué(s)` +
             (nbSuggest ? ` · ${nbSuggest} suggestion(s) manuelle(s) en attente de validation` : '') +
             (nbGrouped ? ` · ${nbGrouped} regroupement(s) possible(s) à examiner` : '') + '.',
             'Rapprochement'
      );
    }
  } else if(nbSuggest || nbGrouped){
    notify('info',
           `${nbSuggest} suggestion(s) pré-sélectionnée(s)` +
           (nbGrouped?` · ${nbGrouped} regroupement(s) possible(s) détecté(s)`:'') +
           ` — vérifiez et validez chaque ligne.`, 'Rapprochement');
  } else {
    notify('warn', 'Aucun rapprochement possible trouvé. Vérifiez que le journal comptable est bien renseigné.', 'Rapprochement');
  }
  render();
}

async function toutRappr(){
  const ids=D.comptes.flatMap(c=>(c.transactions||[]).filter(t=>!t.rapproche).map(t=>t.id));
  if(!ids.length) return;
  if(!confirm(`Rapprocher les ${ids.length} transaction(s) restantes sans vérification ?`)) return;
  await SB.from('transactions').update({rapproche:true}).in('id',ids);
  D.comptes.forEach(c=>(c.transactions||[]).forEach(t=>{t.rapproche=true}));
  notify('success', `${ids.length} transaction(s) rapprochées.`, 'Rapprochement');
  render();
}

// Annule un rapprochement effectué par erreur (auto ou manuel).
async function annulerRapprochement(id){
  if(!confirm('Annuler le rapprochement de cette transaction ?')) return;
  await SB.from('transactions').update({rapproche:false, ecriture_piece:null, ecriture_pieces_json:null}).eq('id',id);
  const t=D.comptes.flatMap(c=>c.transactions||[]).find(x=>x.id===id);
  if(t){ t.rapproche=false; t.ecriture_piece=null; t.ecriture_pieces_json=null; }
  notify('info','Rapprochement annulé — la transaction repasse en attente.','Rapprochement');
  render();
}

// ═══════════════════════════════════════════════════
// LOGO
// ═══════════════════════════════════════════════════
function importLogo(e){
  const file=e.target.files[0];if(!file)return;
  const r=new FileReader();
  r.onload=()=>{D.logoUrl=clubLogoUrl();render();alert("L'import direct n'est pas disponible ici. Utilisez l'URL du logo publiée.");};
  r.readAsDataURL(file);
}
function loadLogoUrl(){
  D.logoUrl=clubLogoUrl();updLogo();alert('Le logo configuré a été appliqué.');
}

// ═══════════════════════════════════════════════════
// IMPORT CSV ADHÉRENTS
// ═══════════════════════════════════════════════════
function parseCSV(txt,sep){
  const lines=txt.split(/\r?\n/).filter(l=>l.trim());
  if(!lines.length)return{headers:[],rows:[]};
  const headers=lines[0].split(sep).map(h=>h.trim().replace(/^["']|["']$/g,''));
  const rows=lines.slice(1).map(line=>{
    const vals=csvSplit(line,sep);
    const obj={};
    headers.forEach((h,i)=>obj[h]=(vals[i]||'').trim().replace(/^["']|["']$/g,''));
    return obj;
  }).filter(r=>Object.values(r).some(v=>v.trim()));
  return{headers,rows};
}
function csvSplit(line,sep){
  const res=[];let cur='';let inQ=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'&&!inQ){inQ=true;continue;}
    if(c==='"'&&inQ){inQ=false;continue;}
    if(c===sep&&!inQ){res.push(cur);cur='';continue;}
    cur+=c;
  }
  res.push(cur);return res;
}
function autoMap(headers,fields){
  const m={};
  fields.forEach(f=>{
    const hLow=headers.map(h=>h.toLowerCase().trim());
    for(const alias of f.aliases){
      const idx=hLow.findIndex(h=>h===alias||h.includes(alias));
      if(idx>=0){m[f.key]=headers[idx];break;}
    }
  });
  return m;
}

function onImpAdhFile(e){
  const file=e.target.files[0];if(!file)return;
  const r=new FileReader();
  r.onload=ev=>{IMP.adh.raw=ev.target.result.replace(/^\uFEFF/,'');parseImpAdh(IMP.adh.raw);};
  r.readAsText(file,'UTF-8');
  e.target.value='';
}
function parseImpAdh(txt){
  const {headers,rows}=parseCSV(txt,IMP.adh.sep);
  IMP.adh.headers=headers;IMP.adh.rows=rows;
  IMP.adh.mapping=autoMap(headers,ADH_FIELDS);
  showST('admin','imp_adh');
}

async function doImportAdh(){
  if(!requireExerciceActif()) return;
  const m=IMP.adh.mapping;
  if(!m.nom||!m.prenom){
    document.getElementById('adh-imp-res').innerHTML=`<div class="imp-err">✗ Les colonnes Nom et Prénom sont obligatoires</div>`;return;
  }
  IMP.adh.importing=true;render();
  const dateISO=v=>{if(!v)return null;v=v.trim();const x=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(x)return`${x[3].length===2?'20'+x[3]:x[3]}-${x[2].padStart(2,'0')}-${x[1].padStart(2,'0')}`;if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;return null;};
  const bool=v=>{if(!v)return false;const s=v.toLowerCase().trim();return['oui','yes','true','1','x'].includes(s);};
  const num=v=>parseFloat((v||'').replace(',','.'))||0;
  const rows=IMP.adh.rows.map(r=>normalizeAdherentFinance({nom:(r[m.nom]||'').trim().toUpperCase(),prenom:(r[m.prenom]||'').trim(),naissance:dateISO(r[m.naissance]),couleur_ceinture:(r[m.couleur_ceinture]||'').trim(),numero_licence:(r[m.numero_licence]||'').trim(),email:(r[m.email]||'').trim().toLowerCase(),telephone:(r[m.telephone]||'').trim(),adresse:(r[m.adresse]||'').trim(),code_postal:(r[m.code_postal]||'').trim(),ville:(r[m.ville]||'').trim(),discipline:r[m.discipline]||'Club',cotisation:num(r[m.cotisation]),paiement:r[m.paiement]||'Chèque',date_inscription:dateISO(r[m.date_inscription])||td(),date_fin_adhesion:dateISO(r[m.date_fin_adhesion]),statut:r[m.statut]||'Actif',certificat:bool(r[m.certificat]),droit_image:bool(r[m.droit_image]),reglement:bool(r[m.reglement]),pass_region:bool(r[m.pass_region]),montant_pass_region:num(r[m.montant_pass_region]),urgence_nom:(r[m.urgence_nom]||'').trim(),urgence_telephone:(r[m.urgence_telephone]||'').trim(),notes:(r[m.notes]||'').trim(),exercice_id:D.currentExo?.id||null})).filter(r=>r.nom&&r.prenom);
  let ok=0,err=0;
  for(let i=0;i<rows.length;i+=50){
    const {data,error}=await SB.from('adherents').insert(rows.slice(i,i+50)).select();
    if(error)err+=50;else{
      ok+=(data||[]).length;
      D.adherents.push(...(data||[]));
      for(const adh of (data||[])){
        try{await syncAdherentJournal(adh);}catch(e){}
      }
    }
  }
  D.adherents=sortAdherentsList(D.adherents);
  IMP.adh.importing=false;
  const res=document.getElementById('adh-imp-res');
  if(res)res.innerHTML=`<div class="${err===0?'imp-ok':'imp-warn'}">${err===0?'✓':'⚠'} Import terminé : <strong>${ok} adhérent(s)</strong> importé(s)${err>0?` — ${err} erreur(s)`:''}.
    <a href="#" onclick="showTab('adherents');return false" style="margin-left:8px;color:inherit;font-weight:500">Voir la liste →</a></div>`;
}

// ═══════════════════════════════════════════════════
// IMPORT CSV ÉCRITURES
// ═══════════════════════════════════════════════════
function onImpEcrFile(e){
  const file=e.target.files[0];if(!file)return;
  const r=new FileReader();
  r.onload=ev=>{IMP.ecr.raw=ev.target.result.replace(/^\uFEFF/,'');parseImpEcr(IMP.ecr.raw);};
  r.readAsText(file,'UTF-8');
  e.target.value='';
}
function parseImpEcr(txt){
  const {headers,rows}=parseCSV(txt,IMP.ecr.sep);
  IMP.ecr.headers=headers;IMP.ecr.rows=rows;
  IMP.ecr.mapping=autoMap(headers,ECR_FIELDS);
  showST('admin','imp_ecr');
}

async function doImportEcr(){
  if(!requireExerciceActif()) return;
  const m=IMP.ecr.mapping;
  if(!m.date_op||!m.libelle||(!m.debit&&!m.credit)){
    document.getElementById('ecr-imp-res').innerHTML=`<div class="imp-err">✗ Date, Libellé et Débit/Crédit sont obligatoires</div>`;return;
  }
  IMP.ecr.importing=true;render();
  const dateISO=v=>{if(!v)return td();v=v.trim();const x=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(x)return`${x[3].length===2?'20'+x[3]:x[3]}-${x[2].padStart(2,'0')}-${x[1].padStart(2,'0')}`;if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;return td();};
  const num=v=>parseFloat((v||'').toString().replace(',','.').replace(' ',''))||0;
  let rows=[];
  try{
    rows=IMP.ecr.rows.map((r,idx)=>{
      let deb=num(r[m.debit]),cred=num(r[m.credit]);
      if(m.debit&&!m.credit&&deb<0){cred=Math.abs(deb);deb=0;}
      if(deb>0&&cred>0) throw new Error(`Ligne ${idx+2} invalide : renseignez soit le débit, soit le crédit.`);
      if(deb<=0&&cred<=0) return null;
      let compte=(r[m.compte]||'').trim();
      if(compte&&!compte.includes(' - ')){const match=PLAN.find(p=>p.startsWith(compte));if(match)compte=match;}
      if(!compte)compte='7580 - Autres produits de gestion courante';
      return{date_op:dateISO(r[m.date_op]),piece:(r[m.piece]||'').trim()||null,compte,libelle:(r[m.libelle]||'').trim(),debit:deb,credit:cred,exercice_id:D.currentExo?.id||null};
    }).filter(r=>r&&r.libelle);
  }catch(error){
    IMP.ecr.importing=false;
    render();
    document.getElementById('ecr-imp-res').innerHTML=`<div class="imp-err">✕ ${error.message}</div>`;
    return;
  }
  const issues=pieceBalanceDiagnostics(rows);
  if(issues.length){
    IMP.ecr.importing=false;
    render();
    document.getElementById('ecr-imp-res').innerHTML=`<div class="imp-err">✕ Import refusé : le fichier comptable n'est pas équilibré. ${issues.length} pièce(s) présentent un écart. Première pièce : <strong>${issues[0].piece}</strong> (${issues[0].ecart.toFixed(2)} €).</div>`;
    return;
  }
  let ok=0,err=0;
  for(let i=0;i<rows.length;i+=100){
    const {data,error}=await SB.from('journal_comptable').insert(rows.slice(i,i+100)).select();
    if(error)err+=100;else{ok+=(data||[]).length;D.journal.push(...(data||[]));}
  }
  D.journal.sort((a,b)=>a.date_op<b.date_op?-1:1);
  IMP.ecr.importing=false;
  const res=document.getElementById('ecr-imp-res');
  if(res)res.innerHTML=`<div class="${err===0?'imp-ok':'imp-warn'}">${err===0?'✓':'⚠'} Import terminé : <strong>${ok} écriture(s)</strong> importée(s)${err>0?` — ${err} erreur(s)`:''}.
    <a href="#" onclick="showTab('comptabilite');return false" style="margin-left:8px;color:inherit;font-weight:500">Voir le journal →</a></div>`;
}

// ═══════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════
function dl(c,n,m){const b=new Blob([c],{type:m});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=n;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
function exportCSV(){
  const rows=[['Nom','Prénom','Couleur ceinture','N° licence','Type adhésion','Certif.','Droit image','Pass Région','Montant Pass','Règlement','Cotisation','Paiement','Statut','Saison','Fin adhésion','Adresse','CP','Ville','Urgence nom','Urgence tél']];
  D.adherents.forEach(a=>rows.push([a.nom,a.prenom,a.couleur_ceinture||'',a.numero_licence||'',a.discipline||'Club',a.certificat?'Oui':'Non',a.droit_image?'Oui':'Non',a.pass_region?'Oui':'Non',(+a.montant_pass_region||0).toFixed(2),a.reglement?'Oui':'Non',(+a.cotisation).toFixed(2),a.paiement,a.statut,seasonFromDate(a.date_fin_adhesion||a.date_inscription)||'',a.date_fin_adhesion||'',a.adresse||'',a.code_postal||'',a.ville||'',a.urgence_nom||'',a.urgence_telephone||'']));
  dl('\uFEFF'+rows.map(r=>r.join(';')).join('\n'),`adherents_${td()}.csv`,'text/csv;charset=utf-8');
}

function exportAdhEmailsCSV(){
  // Exporte les emails des adhérents actuellement filtrés (même filtre que la vue)
  const season=currentSeasonLabel();
  const filtered=D.adherents.filter(a=>{
    const txt=(a.nom+' '+a.prenom+' '+(a.ville||'')).toLowerCase();
    const matchesSearch=txt.includes((UI.search.adherents||'').toLowerCase());
    const matchesStatut=!UI.adhFilters.statut || a.statut===UI.adhFilters.statut;
    const matchesType=!UI.adhFilters.type || (a.discipline||'Club')===UI.adhFilters.type;
    const adhSeason=seasonFromDate(a.date_fin_adhesion||a.date_inscription);
    const matchesSeason=UI.adhFilters.season==='all' || !UI.adhFilters.season || adhSeason===season;
    const matchesSpecial=adherentMatchesSpecialFilter(a,UI.adhFilters.special);
    return matchesSearch&&matchesStatut&&matchesType&&matchesSeason&&matchesSpecial&&a.email;
  });
  if(!filtered.length){notify('warn','Aucun adhérent avec email dans la sélection courante.','Export emails');return;}
  const rows=[['Nom','Prénom','Email','Statut','Type adhésion']];
  filtered.forEach(a=>rows.push([a.nom,a.prenom,a.email||'',a.statut,a.discipline||'Club']));
  dl('\uFEFF'+rows.map(r=>r.join(';')).join('\n'),`emails_adherents_${td()}.csv`,'text/csv;charset=utf-8');
  notify('success',`${filtered.length} email(s) exporté(s).`,'Export emails');
}
function exportAchatsCSV(){
  const rows=[['Date','Fournisseur','Désignation','Catégorie','Montant','Mode paiement','Référence','Statut','Pièce']];
  D.achats.forEach(a=>rows.push([a.date_op,a.fournisseur,a.designation,a.categorie,(+a.montant).toFixed(2),a.mode_paiement||'',a.reference_paiement||'',a.statut,a.piece||'']));
  dl('\uFEFF'+rows.map(r=>r.join(';')).join('\n'),`achats_${td()}.csv`,'text/csv;charset=utf-8');
}

function exportAuditCSV(){
  if(!hasPerm('perm_administration')) return;
  const rows=[['Date','Action','Entité','Utilisateur','Détails']];
  (D.auditLogs||[]).forEach(log=>{
    const user=D.users.find(u=>u.id===log.user_id)?.email||log.user_id||'système';
    rows.push([log.created_at||'',log.action||'',log.entity_type||'',user,(log.details||'').replace(/;/g,',')]);
  });
  dl('\uFEFF'+rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(';')).join('\n'),`audit_${td()}.csv`,'text/csv;charset=utf-8');
  notify('success',`${(D.auditLogs||[]).length} événement(s) exportés.`,'Audit');
}

// Export FEC (Fichier des Écritures Comptables) — format Dgfip
function exportFEC(){
  if(!hasPerm('perm_comptabilite')) return;
  const ci=D.clubInfo||{};
  const siren=(ci.siret||'').replace(/\s/g,'').slice(0,9)||'000000000';
  const exo=D.currentExo;
  const exoLib=(exo?.libelle||'').replace(/\s/g,'_')||'exercice';
  // En-tête FEC
  const headers=['JournalCode','JournalLib','EcritureNum','EcritureDate','CompteNum','CompteLib','CompAuxNum','CompAuxLib','PieceRef','PieceDate','EcritureLib','Debit','Credit','EcritureLet','DateLet','ValidDate','Montantdevise','Idevise'];
  const toFECDate=d=>{
    if(!d)return'';
    // accepte ISO yyyy-mm-dd ou FR jj/mm/yyyy
    const iso=d.includes('-')?d:(d.split('/').length===3?`${d.split('/')[2]}-${d.split('/')[1]}-${d.split('/')[0]}`:d);
    return iso.replace(/-/g,'');
  };
  const rows=(D.journal||[]).map((j,i)=>[
    'GEN','Journal général',
    j.piece||`ECR${String(i+1).padStart(6,'0')}`,
    toFECDate(j.date_op),
    (j.compte||'').split(' ')[0],
    (j.compte||'').split(' ').slice(1).join(' ')||j.compte||'',
    '','',
    j.piece||'',
    toFECDate(j.date_op),
    (j.libelle||'').replace(/\|/g,' '),
    Number(j.debit||0).toFixed(2).replace('.',','),
    Number(j.credit||0).toFixed(2).replace('.',','),
    '','','','',''
  ]);
  const content=[headers,...rows].map(r=>r.join('|')).join('\n');
  dl('\uFEFF'+content,`FEC_${siren}_${exoLib}_${td()}.txt`,'text/plain;charset=utf-8');
  notify('success','Export FEC généré.','Comptabilité');
}

function exportJournalCSV(){
  const rows=[['Date','Pièce','Compte','Libellé','Débit','Crédit']];
  D.journal.forEach(j=>rows.push([j.date_op,j.piece||'',j.compte,j.libelle,(+j.debit).toFixed(2),(+j.credit).toFixed(2)]));
  dl('\uFEFF'+rows.map(r=>r.join(';')).join('\n'),`journal_${td()}.csv`,'text/csv;charset=utf-8');
}

function exportGLCSV(){
  const jnl=jnlExo();
  const sorted=[...jnl].sort((a,b)=>(a.date_op||'').localeCompare(b.date_op||''));
  const by={};
  sorted.forEach(j=>{if(!by[j.compte])by[j.compte]=[];by[j.compte].push(j);});
  const rows=[['Compte','Date','Pièce','Libellé','Débit','Crédit','Solde cumulé']];
  Object.keys(by).sort().forEach(acc=>{
    let s=0;
    by[acc].forEach(j=>{
      s+=(+j.credit||0)-(+j.debit||0);
      rows.push([acc,j.date_op,j.piece||'',j.libelle,(+j.debit).toFixed(2),(+j.credit).toFixed(2),s.toFixed(2)]);
    });
    const tD=by[acc].reduce((r,j)=>r+(+j.debit||0),0);
    const tC=by[acc].reduce((r,j)=>r+(+j.credit||0),0);
    rows.push([acc,'---TOTAL---','','',tD.toFixed(2),tC.toFixed(2),(tC-tD).toFixed(2)]);
    rows.push(['','','','','','','']); // ligne vide entre comptes
  });
  const exoLabel=D.currentExo?.libelle||'exercice';
  dl('\uFEFF'+rows.map(r=>r.join(';')).join('\n'),`grand_livre_${exoLabel.replace(/\s/g,'_')}_${td()}.csv`,'text/csv;charset=utf-8');
  notify('success','Grand livre exporté en CSV.','Export');
}
function backupJSON(){
  dl(JSON.stringify({version:'5.2',date:new Date().toISOString(),adherents:D.adherents,comptes:D.comptes,journal:D.journal,achats:D.achats,factures:D.factures,users:D.users,clubInfo:D.clubInfo,exercices:D.exercices},null,2),`affbc_backup_${td()}.json`,'application/json');
}

function triggerBackupImport(){
  document.getElementById('backup-json-input')?.click();
}

function onBackupJSONFile(e){
  const file=e.target.files?.[0];
  if(!file) return;
  const reader=new FileReader();
  reader.onload=async ev=>{
    try{
      const payload=JSON.parse(ev.target.result);
      // Vérification d'intégrité : au moins 3 tables attendues doivent être présentes
      const EXPECTED_TABLES=['adherents','journal','factures'];
      const missing=EXPECTED_TABLES.filter(t=>!(t in payload));
      if(missing.length){
        throw new Error(`Fichier de sauvegarde incomplet ou invalide.\nTables manquantes : ${missing.join(', ')}.\nVérifiez que vous avez sélectionné le bon fichier.`);
      }
      // Afficher un résumé avant de confirmer
      const summary=Object.entries(payload)
        .filter(([k,v])=>Array.isArray(v))
        .map(([k,v])=>`${k} : ${v.length} ligne(s)`)
        .join('\n');
      if(!confirm(`📋 Résumé du fichier de sauvegarde :\n\n${summary}\n\nContinuer la restauration ?`)){
        throw new Error('Import annulé par l\'utilisateur.');
      }
      await restoreBackupJSON(payload);
      IMP.backup.lastMessage='Import JSON terminé avec succès.';
    }catch(err){
      IMP.backup.lastMessage=`Erreur import JSON : ${err.message||err}`;
    }
    IMP.backup.restoring=false;
    render();
  };
  IMP.backup.restoring=true;
  IMP.backup.lastMessage='';
  render();
  reader.readAsText(file,'UTF-8');
  e.target.value='';
}

async function restoreBackupJSON(payload){
  if(!payload||typeof payload!=='object') throw new Error('Fichier JSON invalide.');
  if(!confirm('Cette restauration va remplacer les données actuelles. Voulez-vous continuer ?')) throw new Error('Import annulé.');
  const confirmText=window.prompt(`Opération critique. Saisissez ${DANGEROUS_RESTORE_PHRASE} pour confirmer la restauration complète.`);
  if(String(confirmText||'').trim().toUpperCase()!==DANGEROUS_RESTORE_PHRASE) throw new Error('Confirmation invalide.');
  const {error}=await apiRequest('/admin/restore',{
    method:'POST',
    body:JSON.stringify({...payload,confirmText:DANGEROUS_RESTORE_PHRASE})
  });
  if(error) throw new Error(error.message||'Restauration refusée.');
  notify('success','Restauration terminée. Les données ont été rechargées.');
  await loadAll();
}

// ═══════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════
function bdg(v){return v?`<span class="badge bok">✓</span>`:`<span class="badge bno">✗</span>`}
function fd(d){if(!d)return'';if(typeof d==='string'&&d.includes('/'))return d;const s=(d+'').split('T')[0];const p=s.split('-');return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:d}
function td(){return new Date().toISOString().split('T')[0]}
function showEl(id,msg){const el=document.getElementById(id);if(el){el.textContent=msg;el.style.display='block';}}

// ═══════════════════════════════════════════════════
// DÉMARRAGE
// ═══════════════════════════════════════════════════
window.addEventListener('load', async ()=>{
  const ok=await initBackend();
  if(!ok){
    document.body.innerHTML=`<div style="position:fixed;inset:0;background:#1a0a05;display:flex;align-items:center;justify-content:center;font-family:sans-serif">
    <div style="background:#fff;border-radius:16px;padding:32px;max-width:520px;text-align:center">
    <div style="font-size:40px;margin-bottom:14px">⚠️</div>
    <h2 style="font-size:18px;margin-bottom:10px">Backend indisponible</h2>
    <p style="font-size:13px;color:#666;line-height:1.7;margin-bottom:18px">Le backend Cloudflare n'est pas accessible.</p>
    <button onclick="location.reload()" style="background:#C0392B;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer">Recharger la page</button>
    </div>
    </div>`;
    return;
  }

  try{
    const {data} = await apiRequest('/auth/session');
    const sessionUser = data?.user || data;
    if(sessionUser?.id){
      UI.currentUser = normalizeUserRow(sessionUser);
      document.getElementById('cu-name').textContent = sessionUser.prenom || sessionUser.nom;
      document.getElementById('cu-role').textContent = ROLES[sessionUser.role] || sessionUser.role;
      document.getElementById('login-screen').style.display='none';
      document.getElementById('app').style.display='block';
      resetLoadedData();
      await loadCoreData(true);
      await loadTabData(UI.tab,true);
      if(UI.currentUser?.must_change_password) setTimeout(forcePasswordRotation,120);
      renderTabs();render();
      return;
    }
  }catch(e){}
  await preloadClubBranding();
  showLoginScreen();
});
