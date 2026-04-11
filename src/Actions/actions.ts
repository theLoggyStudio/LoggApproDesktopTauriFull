export const actions = {
    autorisation: {
        recupererPriviliegesDuUser: {
            uri: "/api/pageOuverture/connection",
            obj: {
                loginOrTel: "",
                password: ""
            },
            response: {
                method: "POST",
                mode: "cors",
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
            },
            errorText: "Erreur lors de la connexion :",

            beforeSend: (theFullUrl) => [],
            afterSend: (theFullUrl) => []
        }
    },
    pageOuverture: {
        connection: {
            uri: "/api/pageOuverture/connection",
            obj: {
                loginOrTel: "",
                password: ""
            },
            response: {
                method: "POST",
                mode: "cors",
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
            },
            errorText: "Erreur lors de la connexion :"
        },
        createUser: {
            uri: "/api/pageOuverture/docteur",
            obj: {
                newUser: {}
            },
            response: {
                method: "POST",
                mode: "cors",
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
            },
            errorText: "Erreur lors de la création de l'utilisateur :"
        },
        createCabinet: {
            uri: "/api/pageOuverture/cabinet",
            obj: {
                newCabinet: {}
            },
            response: {
                method: "POST",
                mode: "cors",
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
            },
            errorText: "Erreur lors de la création du cabinet :"
        },
        messageDAuthentification: {
            uri: "/api/pageOuverture/auth",
            obj: {
                loginOrTel: "",
                password: ""
            },
            response: {
                method: "POST",
                mode: "cors",
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
            },
            errorText: "Erreur lors de l'authentification :"
        }
    },
    pageParametre: {
        nomActe: {
          ajouter: {
            uri: "/api/pageParametre/nomActe",
            obj: {
              newNomActe: {}
            },
            response: {
              method: "POST",
              mode: "cors",
              headers: {
                'Content-Type': 'application/json'
              },
            },
            errorText: "Erreur lors de l'ajout du nom d'acte :"
          },
          modifier: {
            uri: "/api/pageParametre/nomActe",
            obj: {
              id: "",
              newNomActe: {}
            },
            response: {
              method: "PUT",
              mode: "cors",
              headers: {
                'Content-Type': 'application/json'
              },
            },
            errorText: "Erreur lors de la modification du nom d'acte :"
          },
          supprimer: {
            uri: "/api/pageParametre/nomActe/:id/:tabId",
            params: {
              id: "id",
              tabId: "tabId"
            },
            response: {
              method: "DELETE",
              mode: "cors",
              headers: {
                'Content-Type': 'application/json'
              },
            },
            errorText: "Erreur lors de la suppression du nom d'acte :"
          },
          lister: {
            uri: "/api/pageParametre/nomActe/:tabId/:limit",
            params: {
              tabId: "tabId",
              limit: "limit"
            },
            response: {
              method: "GET",
              mode: "cors",
              headers: {
                'Content-Type': 'application/json'
              },
            },
            errorText: "Erreur lors de la récupération des noms d'acte :"
          },
          trouver: {
            uri: "/api/pageParametre/nomActe/:id/:tabId",
            params: {
              id: "id",
              tabId: "tabId"
            },
            response: {
              method: "GET",
              mode: "cors",
              headers: {
                'Content-Type': 'application/json'
              },
            },
            errorText: "Erreur lors de la récupération du nom d'acte :"
          }
        },
        nomAssurance: {
          ajouter: {
            uri: "/api/pageParametre/nomAssurance",
            obj: {
              newNomAssurance: {}
            },
            response: {
              method: "POST",
              mode: "cors",
              headers: {
                'Content-Type': 'application/json'
              },
            },
            errorText: "Erreur lors de l'ajout du nom d'Assurance :"
          },
          modifier: {
            uri: "/api/pageParametre/nomAssurance",
            obj: {
              id: "",
              newNomAssurance: {}
            },
            response: {
              method: "PUT",
              mode: "cors",
              headers: {
                'Content-Type': 'application/json'
              },
            },
            errorText: "Erreur lors de la modification du nom d'Assurance :"
          },
          supprimer: {
            uri: "/api/pageParametre/nomAssurance/:id/:tabId",
            params: {
              id: "id",
              tabId: "tabId"
            },
            response: {
              method: "DELETE",
              mode: "cors",
              headers: {
                'Content-Type': 'application/json'
              },
            },
            errorText: "Erreur lors de la suppression du nom d'Assurance :"
          },
          lister: {
            uri: "/api/pageParametre/nomAssurance/:tabId/:limit",
            params: {
              tabId: "tabId",
              limit: "limit"
            },
            response: {
              method: "GET",
              mode: "cors",
              headers: {
                'Content-Type': 'application/json'
              },
            },
            errorText: "Erreur lors de la récupération des noms d'Assurance :"
          },
          trouver: {
            uri: "/api/pageParametre/nomAssurance/:id/:tabId",
            params: {
              id: "id",
              tabId: "tabId"
            },
            response: {
              method: "GET",
              mode: "cors",
              headers: {
                'Content-Type': 'application/json'
              },
            },
            errorText: "Erreur lors de la récupération du nom d'Assurance :"
          }
        }
      },
    navTop: {
        chercherPatients: {
            uri: "/api/navtop/patients/chercher",
            obj: {
                tabId: "",
                theValueSearch: ""
            },
            response: {
                method: "GET",
                mode: "cors",
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
            },
            errorText: "Erreur lors de la recherche des patients :"
        }
    },
    pagePatient: {
        listerLesPatients: {
            uri: "/api/pagePatient/patients/:tabId/:limit",
            params: {
                tabId: "tabId",
                limit: "limit"
            },
            response: {
                method: "GET",
                mode: "cors",
                headers: {
                    'Content-Type': 'application/json'
                },
            },
            errorText: "Erreur lors de la récupération des patients :"
        },
        ajouterUnPatient: {
            uri: "/api/pagePatient/patient",
            obj: {
                encryptedData: {}
            },
            response: {
                method: "POST",
                mode: "cors",
                headers: {
                    'Content-Type': 'application/json'
                },
            },
            errorText: "Erreur lors de l'ajout du patient :"
        },
        voirLeQrCodeDuUser: {
            uri: "/api/pagePatient/qrcode/:userId/:index/:tabId",
            params: {
                userId: "userId",
                index: "index",
                tabId: "tabId"
            },
            response: {
                method: "GET",
                mode: "cors",
                headers: {
                    'Content-Type': 'application/json'
                },
            },
            errorText: "Erreur lors de la récupération du QR code de l'utilisateur :"
        }
    },
    pagePatientDetail: {
        ajouterUnActe: {
            uri: "/api/pagePatientDetail/acte",
            obj: {
                newActe: {}
            },
            response: {
                method: "POST",
                mode: "cors",
                headers: {
                    'Content-Type': 'application/json'
                },
            },
            errorText: "Erreur lors de l'ajout d'un acte :"
        },
        modifierLePatient: {
            uri: "/api/pagePatientDetail/patient",
            obj: {
                updatedPatient: {}
            },
            response: {
                method: "PUT",
                mode: "cors",
                headers: {
                    'Content-Type': 'application/json'
                },
            },
            errorText: "Erreur lors de la modification des informations du patient :",
        }
    },
    qrCode: {
        qrcode: {
            voir: {
                uri: "/api/img/qrcode",
                params: ["id", "index", "tabId"],
                response: {
                    method: "GET",
                    mode: "cors",
                    headers: {
                        'Content-Type': 'application/json'
                    },
                },
                errorText: "Erreur lors de la récupération du QR code :"
            },
            ajouter: {
                uri: "/api/img/qrcode",
                obj: {
                    id: "",
                    loggId: "",
                    tabId: ""
                },
                response: {
                    method: "POST",
                    mode: "cors",
                    headers: {
                        'Content-Type': 'application/json'
                    },
                },
                errorText: "Erreur lors de l'ajout du QR code :"
            },
        },
    },
    photo: {
        voir: {
            uri: "/api/img/photo",
            params: ["imgId", "index", "tabId"],
            response: {
                method: "GET",
                mode: "cors",
                headers: {
                    'Content-Type': 'application/json'
                },
            },
            errorText: "Erreur lors de la récupération de la photo :"
        },
        ajouter: {
            uri: "/api/img/photo",
            obj: {
                id: "",
                part1: "",
                part2: "",
                part3: "",
                part4: "",
                part5: "",
                tabId: ""
            },
            response: {
                method: "POST",
                mode: "cors",
                headers: {
                    'Content-Type': 'application/json'
                },
            },
            errorText: "Erreur lors de l'ajout de la photo :"
        },
    },
};