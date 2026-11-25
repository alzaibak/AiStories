# Retours et remboursements — checklist manuelle

Prérequis : Stripe en mode test, `node scripts/seed-returns-demo.js` exécuté, compte `demo.returns@recis-islamiques.test` (mot de passe `DemoReader2026!`).

## Facturation et remboursement
- [ ] Acheter le livre papier de démonstration (24,90 € + 4,90 €) avec une carte de test Stripe.
- [ ] Dans l'admin → Marché → commandes, passer la commande en « livrée » (ou `PATCH /admin/orders/:id/delivery-date`).
- [ ] Depuis le compte client → Commandes, vérifier le compte à rebours (30 jours) et ouvrir « Retourner ce livre ».
- [ ] Choisir un motif, vérifier l'écran récapitulatif (prix payé, frais déduits, total).
- [ ] Admin → Marché → Retours : approuver, saisir un numéro de suivi côté client, marquer reçu, inspecter « accepté », émettre le remboursement, clôturer.
- [ ] Vérifier le montant exact dans le dashboard Stripe et les e-mails reçus (créé, approuvé, remboursé).
- [ ] Rejouer avec une commande livrée il y a 20 jours (dans la fenêtre commerciale, hors rétractation) : 4,90 € doivent être déduits.

## Cas limites
- [ ] Commande livrée il y a 31 jours : le bouton devient « non éligible » avec l'explication de fenêtre fermée.
- [ ] Livre défectueux (motif avec photos obligatoires) : l'envoi sans photo est bloqué ; avec photo, remboursement intégral frais inclus.
- [ ] Commande multi-livres : retour partiel → quote-part des frais ; retour complet → frais déduits une seule fois.
- [ ] Mystery Box avec politique « standard » : les objets physiques suivent les mêmes règles ; « non retournable » explique le refus.
- [ ] Tenter un second retour sur la même quantité : refusé (`already_returned`).
- [ ] Modifier la politique (30 → 60 jours) : une commande déjà livrée conserve 30 jours.
- [ ] Couper `applyLegalWithdrawalRules` : l'avertissement légal apparaît et la livraison est déduite.
- [ ] Client A ne peut pas ouvrir `/me/returns/:id` d'un retour du client B (404).

## Technique
- [ ] `GET /api/v1/returns/policy` répond sans authentification et reflète les réglages.
- [ ] Export CSV admin avec filtres (statut, motif, faute vendeur, dates) : le fichier ne contient que les lignes filtrées.
- [ ] Échec Stripe simulé (clé invalide) : le remboursement reste `failed`, le retour n'est pas marqué remboursé, l'erreur est visible dans l'admin.
- [ ] Double clic sur « émettre le remboursement » : une seule refund Stripe (clé d'idempotence).
- [ ] Tâche d'expiration : un retour approuvé dont la date d'expédition est dépassée passe en `expired`.
