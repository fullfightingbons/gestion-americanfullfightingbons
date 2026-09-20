// Tests de la lecture du dossier adhérent (public/assets/app.js) :
//   - droit à l'image : un REFUS n'est pas un dossier incomplet, il déclenche une alerte ;
//   - certificat médical : non requis / obligatoire (mineur ou « oui » au questionnaire
//     de santé) / exigence inconnue, et son état (fourni, à valider, manquant) ;
//   - renouvellement : l'inscription d'une saison passée ne masque pas le « à revalider » ;
//   - filtres, compteurs, export CSV, rendu du tableau et de la fiche ;
//   - ouverture du reçu PDF (openPdfFromApi).
//
// Symptôme d'origine : « le logiciel considère incomplet un dossier juste parce que
// l'adhérent refuse le droit à l'image ». Cause : trois endroits d'app.js testaient
// `!a.certificat || !a.droit_image || !a.reglement`, alors que droit_image = 0 est un
// CHOIX de l'adhérent (imageRights === "no" à l'inscription), pas une pièce manquante.
//
// Même méthode que gl-accounting.test.ts : app.js est un script classique, on le charge
// tel quel dans un bac à sable node:vm puis on appelle ses VRAIES fonctions — pas une
// copie recopiée ici.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appJsSource = readFileSync(path.join(__dirname, "../public/assets/app.js"), "utf8");

function loadAppAndRun(driverCode: string, extra: Record<string, unknown> = {}): any {
  let captured: unknown;
  const noop = () => {};
  const sandbox: Record<string, unknown> = {
    console,
    crypto: globalThis.crypto,
    URL,
    Blob,
    setTimeout: () => 0, // openPdfFromApi programme la révocation de l'URL blob à 120 s
    capture: (v: unknown) => {
      captured = v;
    },
  };
  sandbox.document = {
    addEventListener: noop,
    removeEventListener: noop,
    getElementById: () => null,
    createElement: () => ({ style: {}, classList: { add: noop, remove: noop }, click: noop, remove: noop }),
    body: { innerHTML: "", appendChild: noop },
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = noop;
  sandbox.removeEventListener = noop;
  sandbox.navigator = {};
  sandbox.location = { href: "" };
  sandbox.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
  sandbox.fetch = () => Promise.reject(new Error("fetch indisponible en test"));
  Object.assign(sandbox, extra);

  vm.createContext(sandbox);
  vm.runInContext(appJsSource + "\n;(function(){\n" + driverCode + "\n})();", sandbox, {
    filename: "app.js (sandbox test)",
  });
  return captured;
}

// ── Jeux de données ───────────────────────────────────────────────────────────
// reg(id, {mineur, qs:{chestPain:'yes'}, image:'no', docs:{medicalCertificate:DOC}, at, practice})
//   → une ligne inscriptions_publiques telle que la renvoie l'API (colonnes JSON en TEXT).
// adh(id, {...}) → une ligne adherents de la saison 2026-2027 (adulte, dossier complet).
const FIXTURES = `
  var QS_NO={familyCardiacDeath:'no',chestPain:'no',wheezing:'no',fainting:'no',sportStop:'no',longTermTreatment:'no',bonePain:'no',practiceInterrupted:'no',medicalAdviceNeeded:'no'};
  var DOC={bucket:'b',key:'k.pdf',name:'certificat.pdf'};
  function reg(id,o){
    o=o||{};
    var qs=Object.assign({},QS_NO,o.qs||{});
    var anyYes=Object.keys(qs).some(function(k){return qs[k]==='yes'});
    var mineur=o.mineur?1:0;
    var at=o.at||'2026-09-08T10:00:00.000Z';
    return {id:'reg_'+id,adherent_id:id,mineur:mineur,droit_image:o.image==='no'?0:1,submitted_at:at,created_at:at,updated_at:at,
      dossier_json:JSON.stringify({health:{qsSport:qs},
        consents:{imageRights:o.image==='no'?'no':'yes',rulesAccepted:true,applicantSignatureName:'Alex Dupont',signedAt:at},
        practice:o.practice||{},computedTotals:{certificateRequired:(mineur===1||anyYes)}}),
      documents_json:JSON.stringify(o.docs||{})};
  }
  function adh(id,o){
    return Object.assign({id:id,nom:'DUPONT',prenom:'Alex',naissance:'1990-05-12',statut:'Actif',discipline:'Club',
      cotisation:250,montant_pass_region:0,droit_image:1,certificat:1,reglement:1,pass_region:0,
      date_inscription:'2026-09-08',date_fin_adhesion:'2027-06-30'},o||{});
  }
  UI.currentUser={role:'admin',id:'u_admin'};
`;

const run = (driver: string) => loadAppAndRun(FIXTURES + driver);

describe("droit à l'image — un refus n'est PAS un dossier incomplet", () => {
  it("adulte qui refuse le droit à l'image, dossier complet par ailleurs → pas incomplet, mais alerte", () => {
    // Cas exact signalé : inscription en ligne, refus du droit à l'image, questionnaire
    // de santé sans « oui » (certificat non requis, donc certificat=1 à l'inscription).
    const r = run(`
      D.adherents=[adh('a1',{droit_image:0})];
      D.publicRegistrations=[reg('a1',{image:'no'})];
      var st=adherentDossierStatus(D.adherents[0]);
      capture({incomplete:st.incomplete,missing:st.missing,image:st.image.state,
        alerts:st.alerts.map(function(a){return a.code}),
        filterIncomplete:adherentMatchesSpecialFilter(D.adherents[0],'incomplete'),
        filterImage:adherentMatchesSpecialFilter(D.adherents[0],'image_refuse')});
    `);
    expect(r.incomplete).toBe(false);
    expect(r.missing).toEqual([]);
    expect(r.image).toBe("refuse");
    expect(r.alerts).toEqual(["droit_image_refuse"]);
    expect(r.filterIncomplete).toBe(false);
    expect(r.filterImage).toBe(true);
  });

  it("même chose pour une fiche sans inscription en ligne (saisie/importée)", () => {
    const r = run(`
      D.adherents=[adh('a1',{droit_image:0})];
      D.publicRegistrations=[];
      var st=adherentDossierStatus(D.adherents[0]);
      capture({incomplete:st.incomplete,image:st.image.state,tip:st.image.tip});
    `);
    expect(r.incomplete).toBe(false);
    expect(r.image).toBe("refuse");
    expect(r.tip).toMatch(/ne publier aucune photo/i);
  });

  it("la provenance du refus est précisée quand il vient de l'inscription en ligne", () => {
    const r = run(`
      D.adherents=[adh('a1',{droit_image:0})];
      D.publicRegistrations=[reg('a1',{image:'no'})];
      capture(adherentDroitImageInfo(D.adherents[0]));
    `);
    expect(r.choixInscription).toBe("no");
    expect(r.tip).toMatch(/Refus exprimé à l.inscription en ligne du 08\/09\/2026/);
  });

  it("signale une fiche modifiée depuis l'inscription (accordé à l'inscription, refusé sur la fiche)", () => {
    const r = run(`
      D.adherents=[adh('a1',{droit_image:0})];
      D.publicRegistrations=[reg('a1',{image:'yes'})];
      capture(adherentDroitImageInfo(D.adherents[0]).tip);
    `);
    expect(r).toMatch(/modifiée depuis l.inscription/);
  });

  it("droit accordé : aucune alerte", () => {
    const r = run(`
      D.adherents=[adh('a1')]; D.publicRegistrations=[reg('a1')];
      var st=adherentDossierStatus(D.adherents[0]);
      capture({image:st.image.state,alerts:st.alerts.length,incomplete:st.incomplete});
    `);
    expect(r).toEqual({ image: "accorde", alerts: 0, incomplete: false });
  });

  it("droit non renseigné (NULL) : ni refus, ni alerte", () => {
    const r = run(`
      D.adherents=[adh('a1',{droit_image:null})]; D.publicRegistrations=[];
      var st=adherentDossierStatus(D.adherents[0]);
      capture({image:st.image.state,alerts:st.alerts.length});
    `);
    expect(r).toEqual({ image: "inconnu", alerts: 0 });
  });
});

describe("certificat médical — obligatoire, non requis, ou inconnu", () => {
  it("mineur, certificat pas encore coché, pièce déposée à l'inscription → à valider (obligatoire)", () => {
    const r = run(`
      D.adherents=[adh('m1',{naissance:'2014-03-01',certificat:0})];
      D.publicRegistrations=[reg('m1',{mineur:true,docs:{medicalCertificate:DOC}})];
      var st=adherentDossierStatus(D.adherents[0]);
      capture({state:st.cert.state,required:st.cert.required,reasons:st.cert.reasons,incomplete:st.incomplete,
        needs:st.needsCertAction,alert:st.alerts.map(function(a){return a.code+':'+a.level+':'+a.label})});
    `);
    expect(r.state).toBe("a_valider");
    expect(r.required).toBe(true);
    expect(r.reasons).toEqual(["Adhérent mineur"]);
    expect(r.incomplete).toBe(true);
    expect(r.needs).toBe(true);
    expect(r.alert).toEqual(["certificat_obligatoire:warn:Certificat obligatoire · à valider"]);
  });

  it("adulte avec un « oui » au questionnaire de santé, aucune pièce → manquant (alerte rouge)", () => {
    const r = run(`
      D.adherents=[adh('a1',{certificat:0})];
      D.publicRegistrations=[reg('a1',{qs:{chestPain:'yes'}})];
      var st=adherentDossierStatus(D.adherents[0]);
      capture({state:st.cert.state,codes:st.cert.reasonCodes,reasons:st.cert.reasons,tip:st.cert.tip,
        alert:st.alerts.map(function(a){return a.level})});
    `);
    expect(r.state).toBe("manquant");
    expect(r.codes).toEqual(["qs"]);
    expect(r.reasons).toEqual(["1 réponse « oui » au questionnaire de santé"]);
    expect(r.alert).toEqual(["danger"]);
  });

  it("confidentialité : le détail question par question n'apparaît pas dans les infobulles du tableau", () => {
    const r = run(`
      D.adherents=[adh('a1',{certificat:0})];
      D.publicRegistrations=[reg('a1',{qs:{chestPain:'yes',longTermTreatment:'yes'}})];
      var st=adherentDossierStatus(D.adherents[0]);
      capture(st.cert.tip+' | '+st.alerts.map(function(a){return a.label+' '+a.detail}).join(' | '));
    `);
    expect(r).toMatch(/2 réponses « oui »/);
    expect(r).not.toMatch(/poitrine|traitement médical|cardiaque/i);
  });

  it("obligatoire ET certificat coché → fourni, alerte verte, plus rien à traiter", () => {
    const r = run(`
      D.adherents=[adh('a1',{certificat:1})];
      D.publicRegistrations=[reg('a1',{qs:{fainting:'yes'},docs:{medicalCertificate:DOC}})];
      var st=adherentDossierStatus(D.adherents[0]);
      capture({state:st.cert.state,resolved:st.cert.resolved,incomplete:st.incomplete,needs:st.needsCertAction,
        level:st.alerts[0].level,required:st.cert.required});
    `);
    expect(r).toEqual({ state: "fourni", resolved: true, incomplete: false, needs: false, level: "ok", required: true });
  });

  it("adulte, questionnaire sans « oui » → non requis (et pas 'fourni' comme avant), aucune alerte certificat", () => {
    const r = run(`
      D.adherents=[adh('a1')]; D.publicRegistrations=[reg('a1')];
      var st=adherentDossierStatus(D.adherents[0]);
      capture({state:st.cert.state,required:st.cert.required,label:st.cert.label,incomplete:st.incomplete,
        codes:st.alerts.map(function(a){return a.code})});
    `);
    expect(r).toEqual({ state: "non_requis", required: false, label: "Non requis", incomplete: false, codes: [] });
  });

  it("fiche sans inscription en ligne : mineur (d'après la naissance) → obligatoire ; adulte → exigence inconnue", () => {
    const r = run(`
      D.adherents=[adh('m1',{naissance:'2014-03-01',certificat:0}),adh('a1',{certificat:0}),adh('a2',{certificat:1})];
      D.publicRegistrations=[];
      var s=D.adherents.map(adherentDossierStatus);
      capture(s.map(function(x){return [x.cert.state,x.cert.required,x.cert.source,x.incomplete]}));
    `);
    expect(r[0]).toEqual(["manquant", true, "age", true]);
    // adulte sans questionnaire : comportement historique conservé (case décochée = à fournir)
    expect(r[1]).toEqual(["a_fournir", null, "aucune", true]);
    expect(r[2]).toEqual(["fourni", null, "aucune", false]);
  });

  it("aucune alarme « certificat » pour une adhésion annulée ou inactive, mais le refus d'image reste signalé", () => {
    const r = run(`
      D.adherents=[adh('m1',{naissance:'2014-03-01',certificat:0,statut:'Adhésion annulée',droit_image:0})];
      D.publicRegistrations=[reg('m1',{mineur:true,image:'no'})];
      var st=adherentDossierStatus(D.adherents[0]);
      capture({needs:st.needsCertAction,codes:st.alerts.map(function(a){return a.code}),
        counts:adherentAlertCounts(D.adherents)});
    `);
    expect(r.needs).toBe(false);
    expect(r.codes).toEqual(["droit_image_refuse"]);
    expect(r.counts.certTraiter).toBe(0);
    expect(r.counts.certRequis).toBe(0);
    expect(r.counts.imageRefuse).toBe(1);
  });
});

describe("renouvellement — l'inscription d'une saison passée ne masque pas le « à revalider »", () => {
  it("adulte renouvelé par le bureau (certificat/règlement remis à 0) : l'ancienne inscription 'non requis' est ignorée", () => {
    // renewAdh() décale date_fin_adhesion à la saison suivante et remet certificat et
    // reglement à 0. L'inscription en ligne d'origine (saison 2025-2026, « non requis »)
    // ne doit pas faire apparaître ce dossier comme "non requis / complet".
    const r = run(`
      D.adherents=[adh('a1',{certificat:0,reglement:0,date_inscription:'2025-09-10',date_fin_adhesion:'2027-06-30'})];
      D.publicRegistrations=[reg('a1',{at:'2025-09-10T09:00:00.000Z'})];
      var info=adherentRegistration(D.adherents[0]);
      var st=adherentDossierStatus(D.adherents[0]);
      capture({current:info.current,state:st.cert.state,required:st.cert.required,incomplete:st.incomplete,missing:st.missing});
    `);
    expect(r.current).toBe(false);
    expect(r.state).toBe("a_fournir");
    expect(r.required).toBe(null);
    expect(r.incomplete).toBe(true);
    expect(r.missing).toEqual(["Certificat médical", "Règlement intérieur"]);
  });

  it("mineur renouvelé : reste 'obligatoire' d'après l'âge, sans réutiliser la pièce de l'an dernier", () => {
    const r = run(`
      D.adherents=[adh('m1',{naissance:'2014-03-01',certificat:0,date_inscription:'2025-09-10',date_fin_adhesion:'2027-06-30'})];
      D.publicRegistrations=[reg('m1',{mineur:true,at:'2025-09-10T09:00:00.000Z',docs:{medicalCertificate:DOC}})];
      var c=adherentCertificatInfo(D.adherents[0]);
      capture({state:c.state,source:c.source,hasDocument:c.hasDocument});
    `);
    expect(r).toEqual({ state: "manquant", source: "age", hasDocument: false });
  });

  it("inscription de la saison en cours : elle prime, même si une plus ancienne existe", () => {
    const r = run(`
      D.adherents=[adh('a1',{certificat:0})];
      D.publicRegistrations=[
        reg('a1',{at:'2025-09-10T09:00:00.000Z'}),
        reg('a1',{at:'2026-09-08T10:00:00.000Z',qs:{sportStop:'yes'},docs:{medicalCertificate:DOC}}),
      ];
      capture(adherentCertificatInfo(D.adherents[0]).state);
    `);
    expect(r).toBe("a_valider");
  });

  it("dossier_json illisible : repli propre sur l'âge, sans exception", () => {
    const r = run(`
      D.adherents=[adh('m1',{naissance:'2014-03-01',certificat:0}),adh('a1',{certificat:1})];
      var bad=reg('m1',{mineur:true}); bad.dossier_json='{pas du json';
      var bad2=reg('a1'); bad2.dossier_json=null;
      D.publicRegistrations=[bad,bad2];
      capture(D.adherents.map(function(a){var c=adherentCertificatInfo(a);return [c.state,c.required]}));
    `);
    expect(r[0]).toEqual(["manquant", true]);
    expect(r[1]).toEqual(["fourni", null]);
  });
});

describe("filtres, compteurs et « dossiers complets »", () => {
  const SCENARIO = `
    D.adherents=[
      adh('ok'),                                                             // complet, droit accordé
      adh('refus',{droit_image:0}),                                          // refus d'image seul
      adh('mineur',{naissance:'2014-03-01',certificat:0}),                   // certificat obligatoire, pièce reçue
      adh('qs',{certificat:0}),                                              // certificat obligatoire, manquant
      adh('qsok',{certificat:1}),                                            // certificat obligatoire, fourni
      adh('regl',{reglement:0}),                                             // règlement non validé
    ];
    D.publicRegistrations=[
      reg('ok'), reg('refus',{image:'no'}),
      reg('mineur',{mineur:true,docs:{medicalCertificate:DOC}}),
      reg('qs',{qs:{bonePain:'yes'}}),
      reg('qsok',{qs:{bonePain:'yes'},docs:{medicalCertificate:DOC}}),
      reg('regl'),
    ];
    function ids(f){return D.adherents.filter(function(a){return adherentMatchesSpecialFilter(a,f)}).map(function(a){return a.id})}
  `;

  it("chaque filtre retient exactement les bons dossiers", () => {
    const r = run(SCENARIO + `capture({inc:ids('incomplete'),traiter:ids('cert_a_traiter'),requis:ids('cert_requis'),refus:ids('image_refuse')});`);
    expect(r.inc).toEqual(["mineur", "qs", "regl"]); // 'refus' N'y est PAS
    expect(r.traiter).toEqual(["mineur", "qs"]);
    expect(r.requis).toEqual(["mineur", "qs", "qsok"]);
    expect(r.refus).toEqual(["refus"]);
  });

  it("adherentAlertCounts cohérent avec les filtres", () => {
    const r = run(SCENARIO + `capture(adherentAlertCounts(D.adherents));`);
    expect(r).toEqual({ certTraiter: 2, certRequis: 3, imageRefuse: 1, incomplete: 3 });
  });

  it("le tableau de bord ne compte plus un refus d'image parmi les dossiers incomplets", () => {
    const src = readFileSync(path.join(__dirname, "../public/assets/app.js"), "utf8");
    expect(src).not.toMatch(/!a\.certificat\s*\|\|\s*!a\.droit_image/);
    expect(src).not.toMatch(/a\.droit_image&&a\.certificat&&a\.reglement/);
    expect(src).not.toMatch(/!adherent\.certificat\s*\|\|\s*!adherent\.droit_image/);
  });

  it("filteredAdherentsList(true) ignore le filtre « dossier » (les compteurs restent visibles quand on filtre)", () => {
    const r = run(SCENARIO + `
      UI.adhFilters={statut:'',type:'',season:'all',special:'image_refuse'};
      UI.search.adherents='';
      capture({filtered:filteredAdherentsList().length,all:filteredAdherentsList(true).length});
    `);
    expect(r).toEqual({ filtered: 1, all: 6 });
  });

  it("setAdhSpecialFilter bascule le filtre et revient à la page 1", () => {
    const r = run(`
      UI.paging.adherents=3; render=function(){};
      setAdhSpecialFilter('image_refuse'); var a=UI.adhFilters.special+'/'+UI.paging.adherents;
      setAdhSpecialFilter('image_refuse'); var b=UI.adhFilters.special;
      capture([a,b]);
    `);
    expect(r).toEqual(["image_refuse/1", ""]);
  });
});

describe("export CSV — nouvelles colonnes en fin de ligne, colonnes existantes intactes", () => {
  it("adherentCsvDossierColumns", () => {
    const r = run(`
      D.adherents=[adh('r',{droit_image:0}),adh('q',{certificat:0}),adh('m',{naissance:'2014-03-01',certificat:1})];
      D.publicRegistrations=[reg('r',{image:'no'}),reg('q',{qs:{chestPain:'yes'}}),reg('m',{mineur:true,docs:{medicalCertificate:DOC}})];
      capture(D.adherents.map(adherentCsvDossierColumns));
    `);
    // [droit image, certificat obligatoire, état, motif, dossier complet]
    expect(r[0]).toEqual(["Refusé", "Non", "Non requis", "", "Oui"]);
    expect(r[1]).toEqual(["Accordé", "Oui", "Manquant", "Questionnaire de santé positif", "Non"]);
    expect(r[2]).toEqual(["Accordé", "Oui", "Fourni", "Mineur", "Oui"]);
  });

  it("les en-têtes historiques sont conservés dans le même ordre", () => {
    const src = readFileSync(path.join(__dirname, "../public/assets/app.js"), "utf8");
    expect(src).toContain(
      "'Certif.','Droit image','Pass Région','Montant Pass','Règlement','Cotisation','Paiement','Statut','Saison'"
    );
    expect(src).toContain("'Urgence nom','Urgence tél','Droit image (détail)'");
  });
});

describe("rendu — tableau Adhérents et fiche adhérent", () => {
  const RENDER = `
    D.adherents=[
      adh('refus',{nom:'AMZIL',prenom:'Mohamed',droit_image:0}),
      adh('mineur',{nom:'BALDAYO',prenom:'Rafael',naissance:'2014-03-01',certificat:0}),
      adh('ok',{nom:'ANTONI',prenom:'Fabien'}),
    ];
    D.publicRegistrations=[reg('refus',{image:'no'}),reg('mineur',{mineur:true,docs:{medicalCertificate:DOC}}),reg('ok')];
    UI.adhFilters={statut:'',type:'',season:'all',special:''}; UI.search.adherents='';
  `;

  it("le tableau affiche les pastilles d'alerte, les compteurs et compte les dossiers complets sans le droit à l'image", () => {
    const html: string = run(RENDER + `capture(vAdh());`);
    expect(html).toContain("Droit à l’image refusé");
    expect(html).toContain("Certificat obligatoire · à valider");
    expect(html).toContain('class="adh-alertbar"');
    // 3 adhérents : 2 dossiers complets (AMZIL, qui refuse l'image, EN FAIT PARTIE)
    expect(html).toMatch(/<div class="v[^"]*">2<\/div><div class="l">Dossiers complets<\/div>/);
    // la ligne dont le certificat obligatoire est à traiter est teintée
    expect(html).toMatch(/<tr class="adh-valid adh-alert">/);
  });

  it("Pass Région non utilisé s'affiche « — » et non plus par un ✗ rouge", () => {
    const html: string = run(RENDER + `capture(vAdh());`);
    expect(html).toContain('title="Pass Région non utilisé">—</span>');
  });

  it("la fiche affiche le questionnaire de santé, les justificatifs et l'alerte", () => {
    const html: string = run(`
      D.adherents=[adh('a1',{certificat:0,droit_image:0})];
      D.publicRegistrations=[reg('a1',{image:'no',qs:{chestPain:'yes'},docs:{medicalCertificate:DOC},
        practice:{passRegionEnabled:false}})];
      capture(renderAdherentDossierPanel(D.adherents[0]));
    `);
    expect(html).toContain("Dossier d’inscription");
    expect(html).toContain("Droit à l’image refusé");
    expect(html).toContain("Certificat obligatoire · à valider");
    // l'apostrophe est échappée en &#39; par esc() : c'est voulu (les réponses viennent d'une saisie utilisateur)
    expect(html).toMatch(/qs-row yes"><span>As-tu ressenti une douleur dans la poitrine à l&#39;effort \?<\/span><strong>OUI/);
    expect(html).toContain("Pour valider : ouvrez la pièce");
    expect(html).toMatch(/Certificat médical<\/span><span class="badge bok">✓ Reçu/);
  });

  it("la fiche d'une adhérente sans inscription en ligne l'explique au lieu d'inventer des réponses", () => {
    const html: string = run(`
      D.adherents=[adh('a1')]; D.publicRegistrations=[];
      capture(renderAdherentDossierPanel(D.adherents[0]));
    `);
    expect(html).toContain("Aucune inscription en ligne rattachée");
    expect(html).not.toContain("qs-list");
  });

  it("échappe le HTML des valeurs saisies (nom du signataire, code Pass Région)", () => {
    const html: string = run(`
      D.adherents=[adh('a1',{pass_region:1,montant_pass_region:30})];
      var r=reg('a1',{practice:{passRegionEnabled:true,passRegionCode:'<img src=x onerror=alert(1)>'}});
      var d=JSON.parse(r.dossier_json); d.consents.applicantSignatureName='<script>x</script>'; r.dossier_json=JSON.stringify(d);
      D.publicRegistrations=[r];
      capture(renderAdherentDossierPanel(D.adherents[0]));
    `);
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>x");
    expect(html).toContain("&lt;img src=x");
  });
});

describe("bouton « Reçu » — vrai PDF via l'API", () => {
  const PDF_DRIVER = (fetchImpl: string, openImpl: string) => `
    var notices=[]; notify=function(t,m,ti){notices.push([t,m,ti])};
    var opened=[]; var closed=false;
    window.open=${openImpl};
    fetch=${fetchImpl};
    D.adherents=[adh('a1')];
    capture((async function(){
      await genRecu('a1');
      return {notices:notices,opened:opened,closed:closed};
    })());
  `;

  it("appelle GET /api/adherents/:id/recu-cotisation puis ouvre le PDF dans l'onglet déjà ouvert", async () => {
    const r = await run(
      PDF_DRIVER(
        `function(url,opts){ opened.push({fetch:url,credentials:opts.credentials}); return Promise.resolve({ok:true,status:200,blob:function(){return Promise.resolve(new Blob(['%PDF-1.4']))},headers:{get:function(){return null}}}); }`,
        `function(){ var w={document:{body:{style:{}},title:''},location:{href:''},close:function(){closed=true}}; opened.push({win:w}); return w; }`
      )
    );
    const fetched = r.opened.find((o: any) => o.fetch);
    expect(fetched.fetch).toBe("/api/adherents/a1/recu-cotisation");
    expect(fetched.credentials).toBe("same-origin");
    const win = r.opened.find((o: any) => o.win).win;
    expect(win.location.href).toMatch(/^blob:/);
    expect(r.notices).toEqual([]);
    expect(r.closed).toBe(false);
  });

  it("une erreur serveur (ex. aucune cotisation) s'affiche en notification, sans onglet de JSON brut", async () => {
    const r = await run(
      PDF_DRIVER(
        `function(){ return Promise.resolve({ok:false,status:404,json:function(){return Promise.resolve({data:null,error:{message:"Aucune cotisation enregistrée pour cet adhérent : il n'y a pas de reçu à émettre."}})}}); }`,
        `function(){ return {document:{body:{style:{}},title:''},location:{href:''},close:function(){closed=true}}; }`
      )
    );
    expect(r.closed).toBe(true);
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0][0]).toBe("error");
    expect(r.notices[0][1]).toMatch(/Aucune cotisation enregistrée/);
  });

  it("lit aussi la forme réelle des erreurs de cette route : { error: \"message\" } (chaîne)", async () => {
    const r = await run(
      PDF_DRIVER(
        `function(){ return Promise.resolve({ok:false,status:404,json:function(){return Promise.resolve({error:"Adhérent introuvable"})}}); }`,
        `function(){ return {document:{body:{style:{}},title:''},location:{href:''},close:function(){closed=true}}; }`
      )
    );
    expect(r.notices[0][1]).toBe("Reçu de cotisation impossible : Adhérent introuvable");
  });

  it("erreur non JSON (ex. page d'erreur du proxy) : message générique avec le code HTTP", async () => {
    const r = await run(
      PDF_DRIVER(
        `function(){ return Promise.resolve({ok:false,status:502,json:function(){return Promise.reject(new Error('not json'))}}); }`,
        `function(){ return {document:{body:{style:{}},title:''},location:{href:''},close:function(){closed=true}}; }`
      )
    );
    expect(r.closed).toBe(true);
    expect(r.notices[0][1]).toBe("Reçu de cotisation impossible : erreur 502");
  });

  it("fenêtre bloquée par le navigateur : le PDF est téléchargé sous le nom fourni par le serveur", async () => {
    const r = await run(
      `
      var notices=[]; notify=function(t,m,ti){notices.push([t,m,ti])};
      var link={style:{},click:function(){link.clicked=true},remove:function(){}};
      document.createElement=function(){return link};
      window.open=function(){return null};
      fetch=function(){return Promise.resolve({ok:true,status:200,blob:function(){return Promise.resolve(new Blob(['%PDF-1.4']))},
        headers:{get:function(){return 'inline; filename="Recu-cotisation-ANDRIEU-2026-2027.pdf"'}}})};
      D.adherents=[adh('a1')];
      capture((async function(){ await genRecu('a1'); return {clicked:link.clicked,name:link.download,href:link.href,notices:notices}; })());
    `
    );
    expect(r.clicked).toBe(true);
    expect(r.name).toBe("Recu-cotisation-ANDRIEU-2026-2027.pdf");
    expect(r.href).toMatch(/^blob:/);
    expect(r.notices).toEqual([]);
  });

  it("n'utilise plus l'ancien parcours (éditeur de facture + impression HTML)", () => {
    const src = readFileSync(path.join(__dirname, "../public/assets/app.js"), "utf8");
    const start = src.indexOf("async function genRecu(id){");
    const body = src.slice(start, src.indexOf("\n}\n", start));
    expect(body).not.toContain("invState");
    expect(body).not.toContain("updPrev");
    expect(body).toContain("/recu-cotisation");
  });
});
