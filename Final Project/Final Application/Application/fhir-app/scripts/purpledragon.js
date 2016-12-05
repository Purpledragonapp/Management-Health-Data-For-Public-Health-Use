function PurpleDragon(baseUrl, clientUrl, agencyUrl,  logElementId) {
	var baseUrl = baseUrl;
	var clientUrl = clientUrl;
	var agencyUrl = agencyUrl;

	var logElementId = logElementId;

	function appendLog(text) {
		if (logElementId) {
			$(logElementId).text(function(i, origText) {
				return origText + "\n" + text;
			});
			if ($(logElementId).scrollTop) {
				$(logElementId).scrollTop($(logElementId)[0].scrollHeight);
			}
		}
	};

	function fhirAjaxRequest(url, data, callback, method) {
		return $.ajax({
			url: url,
			type: method,
			data: data,
			headers: {
				'Content-Type': 'application/json+fhir'
			},
			success: callback
		});
	};

	function getRequest(url) {
		return $.get(url);
	};

	function postRequest(url, data) {
		return fhirAjaxRequest(url, data, null, 'POST');
	};

	function putRequest(url, data) {
		return fhirAjaxRequest(url, data, null, 'PUT');
	};

	function generateMask(patient) {
		// In a real production environment, the masking service would make use of patient parameters
		// to derive a mask, and would be able to tell which patient created the resource.
		// To model this, we just create a random 32 character string beginning with 'mask'
		// which we will store with the patient resource as a name to provide relinking services.
		var mask = "mask";
	    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

	    for( var i=4; i < 32; i++ )
	        mask += possible.charAt(Math.floor(Math.random() * possible.length));

	    return mask;
	};

	function processPatient(id) {
		appendLog("Fetching Client Patient " + id + "...");
		return getRequest(clientUrl + "/Patient/" + id)
		.then(function(response) {
			appendLog("Client Patient " + id + " found.");
			console.log(response);
			appendLog("Checking for duplicate...");
			var search = baseUrl + "/Patient?";
			for (var i in response.name) {
				for (var j=0; j < response.name[i].family.length; j++) {
					search += "&family=" + response.name[i].family[j];
				}
				for (var j=0; j < response.name[i].given.length; j++) {
					search += "&given=" + response.name[i].given[j];
				}
			}
			search += "&gender=" + response.gender;
			search = search.replace("?&", "?");
			return getRequest(search)
			.then(function(searchResponse) {
				console.log(searchResponse);
				var patientId;
				var maskedPatientId;
				if (searchResponse.total > 0) {
					patientId = searchResponse.entry[0].resource.id;
					maskedPatientId = findPatientMask(searchResponse.entry[0].resource);
					appendLog("Client Patient " + id + " already exists in database as Unmasked Aggregate Patient " + patientId + " and masked Aggregate patient " + maskedPatientId);
					return maskedPatientId;
				} else {
					appendLog("Client Patient " + id + " not a duplicate. Creating masked patient resource ...");
					maskedPatient = $.extend(true, {}, response);
					delete maskedPatient.id;
					patientMask = generateMask(response);
					maskedPatient.name = {'given': patientMask};
					if (maskedPatient.identifier) {
						delete maskedPatient.identifier;
					}
					if (maskedPatient.address) {
						delete maskedPatient.address;
					}
					if (maskedPatient.birthDate) {
						delete maskedPatient.birthDate;
					}
					return postRequest(baseUrl + "/Patient", JSON.stringify(maskedPatient))
					.then (function(mcResponse, textStatus, request) {
						var location = request.getResponseHeader("Location");
						var start = location.indexOf(baseUrl + "/Patient/") + (baseUrl + "/Patient/").length;
						var end = location.indexOf("/_history");
						maskedPatientId = location.substring(start, end);
						appendLog("Client Patient " + id + "saved as masked aggregate patient " + maskedPatientId + ".");
						console.log(mcResponse);
						unmaskedPatient = $.extend(true, {},  response);
						delete unmaskedPatient.id;
						unmaskedPatient.link = {'other': {'reference': 'Patient/' + maskedPatientId, 'display': patientMask}};
						return postRequest(baseUrl + "/Patient", JSON.stringify(unmaskedPatient))
						.then(function(saveResponse, textStatus, request) {
							var location = request.getResponseHeader("Location");
							var start = location.indexOf(baseUrl + "/Patient/") + (baseUrl + "/Patient/").length;
							var end = location.indexOf("/_history");
							patientId = location.substring(start, end);
							appendLog("Client Patient " + id + " saved as Aggregate Patient " + patientId + ".");
							console.log(saveResponse);
							return maskedPatientId;
						})
						.fail(function(err) {
							appendLog("Failed while creating new resource for client patient " + id);
						});
					})
					.fail(function(err) {
						appendLog("Failed while creating masked resource for client patient " + id);
					})
				}
			})
			.fail(function(err) {
				appendLog("Failed while checking for duplicate for client patient " + id);
			});
		})
		.fail(function(err) {
			appendLog("Could not process patient with id " + id);
			console.log("response error");
			console.log(err);
		});
	};

	function processPractitioner(id) {
		appendLog("Fetching Client Practitioner " + id + "...");
		return getRequest(clientUrl + "/Practitioner/" + id)
		.then(function(response) {
			appendLog("Client Practitioner " + id + " found.");
			console.log(response);
			if (response.practitionerRole) {
				delete response.practitionerRole;
			}
			appendLog("Checking for duplicate...");
			var search = baseUrl + "/Practitioner?";
			for (var j=0; j < response.name.family.length; j++) {
				search += "&family=" + response.name.family[j];
			}
			for (var j=0; j < response.name.given.length; j++) {
				search += "&given=" + response.name.given[j];
			}
			search += "&gender=" + response.gender;
			search = search.replace("?&", "?");
			return getRequest(search)
			.then(function(searchResponse) {
				console.log(searchResponse);
				var practitionerId;
				if (searchResponse.total > 0) {
					practitionerId = searchResponse.entry[0].resource.id;
					appendLog("Client Practitioner " + id + " already exists in database as Unmasked Aggregate Practitioner " + practitionerId);
					return practitionerId;
				} else {
					appendLog("Client Practitioner " + id + " not a duplicate. Creating practitioner resource ...");
					delete response.id;
					return postRequest(baseUrl + "/Practitioner", JSON.stringify(response))
					.then (function(saveResponse, textStatus, request) {
						var location = request.getResponseHeader("Location");
						var start = location.indexOf(baseUrl + "/Practitioner/") + (baseUrl + "/Practitioner/").length;
						var end = location.indexOf("/_history");
						practitionerId = location.substring(start, end);
						appendLog("Client Practitioner " + id + " saved as Aggregate Practitioner " + practitionerId + ".");
						console.log(saveResponse);
						return practitionerId;
					})
					.fail(function(err) {
						appendLog("Failed while creating new resource for client practitioner " + id);
					});
				}
			})
			.fail(function(err) {
				appendLog("Failed while checking for duplicate for client practitioner " + id);
			});
		})
		.fail(function(err) {
			appendLog("Could not process practitioner with id " + id);
			console.log("response error");
			console.log(err);
		});
	};

	function findPatientMask(patient) {
		for (var i in patient.link) {
			potentialMask = patient.link[i].other.display;
			if ((potentialMask.length == 32) && (potentialMask.substring(0, 4) == "mask")) {
				maskReference = patient.link[i].other.reference;
				start = maskReference.indexOf('Patient/') + 8;
				end = maskReference.length;
				return patient.link[i].other.reference.substring(start, end);
			}
		}
		return -1;
	};

	function sendResourceToAgency(resource, id) {
		// Models a push and pull system to get resources into the agency database.
		// In a production environmet
		return getRequest(baseUrl + "/" + resource + "/" + id)
		.then(function(response) {
			appendLog("Found " + resource + "/" + id + ". Sending to agency...");
			response.id = "c" + response.id;
			if (response.subject) {
				if (response.subject.reference) {
					startId = response.subject.reference.indexOf("/") + 1;
					endId = response.subject.reference.length;
					sendResourceToAgency("Patient", response.subject.reference.substring(startId, endId))
					.then(function() {					
						response.subject.reference = response.subject.reference.substring(0, startId) + "c" + response.subject.reference.substring(startId, endId);
						return putRequest(agencyUrl + "/" + resource + "/c" + id, JSON.stringify(response))
						.then(function(putResponse) {
							console.log(putResponse);
							appendLog("Successfully sent " + resource + "/" + id + " to agency.");
						})
						.fail(function(err) {
							appendLog("Failed to send " + resource + "/" + id + " to agency.");
						})
					})
					.fail(function() {
						appendLog("Failed to send Patient/" + response.subject.reference.substring(startId, endId) + " to agency.")
					});
				}
			} else if (response.patient) {
				if (response.patient.reference) {
					startId = response.patient.reference.indexOf("/") + 1;
					endId = response.patient.reference.length;
					sendResourceToAgency("Patient", response.patient.reference.substring(startId, endId))
					.then(function() {			
						response.patient.reference = response.patient.reference.substring(0, startId) + "c" + response.patient.reference.substring(startId, endId);
						if (response.prescriber) {
							start = response.prescriber.reference.indexOf("/") + 1;
							end = response.prescriber.reference.length;
							sendResourceToAgency("Practitioner", response.prescriber.reference.substring(start, end))
							.then(function() {			
								response.prescriber.reference = response.prescriber.reference.substring(0, start) + "c" + response.prescriber.reference.substring(start, end);
								return putRequest(agencyUrl + "/" + resource + "/c" + id, JSON.stringify(response))
								.then(function(putResponse) {
									console.log(putResponse);
									appendLog("Successfully sent " + resource + "/" + id + " to agency.");
								})
								.fail(function(err) {
									appendLog("Failed to send " + resource + "/" + id + " to agency.");
								});
							})
							.fail(function(err) {
								appendLog("Failed to send Practitioner/" + response.prescriber.reference.substring(start, end) + " to agency.");
							});
						} else {
							return putRequest(agencyUrl + "/" + resource + "/c" + id, JSON.stringify(response))
							.then(function(putResponse) {
								console.log(putResponse);
								appendLog("Successfully sent " + resource + "/" + id + " to agency.");
							})
							.fail(function(err) {
								appendLog("Failed to send " + resource + "/" + id + " to agency.");
							});
						}
					})
					.fail(function() {
						appendLog("Failed to send Patient/" + response.patient.reference.substring(startId, endId) + " to agency.")
					});
				}
			} else {
				return putRequest(agencyUrl + "/" + resource + "/c" + id, JSON.stringify(response))
				.then(function(putResponse) {
					console.log(putResponse);
					appendLog("Successfully sent " + resource + "/" + id + " to agency.");
				})
				.fail(function(err) {
					appendLog("Failed to send " + resource + "/" + id + " to agency.");
				});
			}
		})
		.fail(function(err) {
			appendLog("Failed to find " + resource + "/" + id);
		});
	};

	this.processObservation = function(id) {
		appendLog("Fetching Client Observation " + id + "...");
		return getRequest(clientUrl + "/Observation/" + id)
		.then(function(response) {
			appendLog("Client Observation " + id + " found.");
			console.log(response);
			appendLog("Updating Patient refernce...");
			return processPatient(response.subject.reference.split("/")[1])
			.then(function(newPatientId) {
				response.subject = {'reference': "Patient/" + newPatientId};
				appendLog("Updated Patient reference to Patient/" + newPatientId);
				appendLog("Checking for duplicate...");
				var search = baseUrl + "/Observation?";
				for (var i in response.code.coding) {
					search += "&code=" + response.code.coding[i].system + "|" + response.code.coding[i].code;
				}
				search += "&subject=" + response.subject.reference;
				if (response.valueQuantity) {
					search += "&value-quantity=" + response.valueQuantity.value + "|" + response.valueQuantity.system + "|" + encodeURIComponent(response.valueQuantity.code);
				}
				search = search.replace("?&", "?");
				return getRequest(search)
				.then(function(searchResponse) {
					console.log(searchResponse);
					var observationId;
					if (searchResponse.total > 0) {
						observationId = searchResponse.entry[0].resource.id;
						appendLog("Client Observation " + id + " already exists in database as Aggregate Observation " + observationId);
						sendResourceToAgency("Observation", observationId);
						return observationId;
					} else {
						appendLog("Client Observation " + id + " not a duplicate. Persisting...");
						delete response.id;
						return postRequest(baseUrl + "/Observation", JSON.stringify(response))
						.then(function(saveResponse, textStatus, request) {
							var location = request.getResponseHeader("Location");
							var start = location.indexOf(baseUrl + "/Observation/") + (baseUrl + "/Observation/").length;
							var end = location.indexOf("/_history");
							observationId = location.substring(start, end);
							appendLog("Client Observation " + id + " saved as Aggregate Observation " + observationId + ".");
							console.log(saveResponse);
							sendResourceToAgency("Observation", observationId);
							return observationId;
						})
						.fail(function(err) {
							appendLog("Failed while creating new resource for client observation " + id);
						});
					}
				})
				.fail(function(err) {
					appendLog("Failed while checking for duplicate of client observation " + id);
				});
			})
			.fail(function(err) {
				appendLog("Failed while updating patient reference for client observation " + id);
			});
		})
		.fail(function(err) {
			appendLog("Could not process observation with id " + id);
			console.log(err);
		});
	};

	this.processCondition = function(id) {
		appendLog("Fetching Client Condition " + id + "...");
		return getRequest(clientUrl + "/Condition/" + id)
		.then(function(response) {
			appendLog("Client Condition " + id + " found.");
			console.log(response);
			if (response.patient) {
				appendLog("Updating Patient refernce...");
				return processPatient(response.patient.reference.split("/")[1])
				.then(function(newPatientId) {
					response.patient = {'reference': "Patient/" + newPatientId};
					appendLog("Updated Patient reference to Patient/" + newPatientId);
					appendLog("Checking for duplicate...");
					var search = baseUrl + "/Condition?";
					for (var i in response.code.coding) {
						search += "&code=" + response.code.coding[i].system + "|" + response.code.coding[i].code;
					}
					search += "&patient=" + response.patient.reference;
					search = search.replace("?&", "?");
					return getRequest(search)
					.then(function(searchResponse) {
						console.log(searchResponse);
						var conditionId;
						if (searchResponse.total > 0) {
							conditionId = searchResponse.entry[0].resource.id;
							appendLog("Client Condition " + id + " already exists in database as Aggregate Condition " + conditionId);
							sendResourceToAgency("Condition", conditionId);	
							return conditionId;
						} else {
							appendLog("Client Condition " + id + " not a duplicate. Persisting...");
							delete response.id;
							return postRequest(baseUrl + "/Condition", JSON.stringify(response))
							.then(function(saveResponse, textStatus, request) {
								var location = request.getResponseHeader("Location");
								var start = location.indexOf(baseUrl + "/Condition/") + (baseUrl + "/Condition/").length;
								var end = location.indexOf("/_history");
								conditionId = location.substring(start, end);
								appendLog("Client Condition " + id + " saved as Aggregate Condition " + conditionId + ".");
								console.log(saveResponse);
								sendResourceToAgency("Condition", conditionId);
								return conditionId;
							})
							.fail(function(err) {
								appendLog("Failed while creating new resource for client condition " + id);
							});
						}
					})
					.fail(function(err) {
						appendLog("Failed while checking for duplicate of client condition " + id);
					});
				})
				.fail(function(err) {
					appendLog("Failed while updating patient reference for client condition " + id);
				});
			} else {
				appendLog("Client Condition " + id + " has no patient resource. Not persisting.")
			}
		})
		.fail(function(err) {
			appendLog("Could not process condition with id " + id);
			console.log(err);
		});
	};

	this.processMedication = function(id) {
		appendLog("Fetching Client Medication " + id + "...");
		return getRequest(clientUrl + "/Medication/" + id)
		.then(function(response) {
			appendLog("Client Medication " + id + " found.");
			console.log(response);
			appendLog("Checking for duplicate...");
			var search = baseUrl + "/Medication?";
			for (var i in response.code.coding) {
				search += "&code=" + response.code.coding[i].system + "|" + response.code.coding[i].code;
			}
			search = search.replace("?&", "?");
			return getRequest(search)
			.then(function(searchResponse) {
				console.log(searchResponse);
				var medicationId;
				if (searchResponse.total > 0) {
					medicationId = searchResponse.entry[0].resource.id;
					appendLog("Client Medication " + id + " already exists in database as Aggregate Medication " + medicationId);
					sendResourceToAgency("Medication", medicationId);
					return medicationId;
				} else {
					appendLog("Client Medication " + id + " not a duplicate. Persisting...");
					delete response.id;
					return postRequest(baseUrl + "/Medication", JSON.stringify(response))
					.then(function(saveResponse, textStatus, request) {
						var location = request.getResponseHeader("Location");
						var start = location.indexOf(baseUrl + "/Medication/") + (baseUrl + "/Medication/").length;
						var end = location.indexOf("/_history");
						medicationId = location.substring(start, end);
						appendLog("Client Medication " + id + " saved as Aggregate Medication " + medicationId + ".");
						console.log(saveResponse);
						sendResourceToAgency("Medication", medicationId);
						return medicationId;
					})
					.fail(function(err) {
						appendLog("Failed while creating new resource for client medication " + id);
					});
				}
			})
			.fail(function(err) {
				appendLog("Failed while checking for duplicate of client medication " + id);
			});
		})
		.fail(function(err) {
			appendLog("Could not process medication with id " + id);
			console.log(err);
		});
	};

	this.processMedicationOrder = function(id) {
		appendLog("Fetching Client MedicationOrder " + id + "...");
		return getRequest(clientUrl + "/MedicationOrder/" + id)
		.then(function(response) {
			appendLog("Client MedicationOrder " + id + " found.");
			console.log(response);
			if (response.patient) {
				appendLog("Updating Patient refernce...");
				return processPatient(response.patient.reference.split("/")[1])
				.then(function(newPatientId) {
					response.patient = {'reference': "Patient/" + newPatientId};
					appendLog("Updated Patient reference to Patient/" + newPatientId);
					if (response.prescriber) {
						appendLog("Updating Prescriber reference...");
						return processPractitioner(response.prescriber.reference.split("/")[1])
						.then(function(newPrescriberId) {
							response.prescriber = {"reference": "Practitioner/" + newPrescriberId};
							appendLog("Updated Prescriber reference to Practitioner/" + newPrescriberId);
							appendLog("Checking for duplicate...");
							var search = baseUrl + "/MedicationOrder?";
							search += "&patient=" + response.patient.reference;
							search += "&prescriber=" + response.prescriber.refernce;
							search += "&datewritten=" + response.dateWritten;
							search = search.replace("?&", "?");
							return getRequest(search)
							.then(function(searchResponse) {
								console.log(searchResponse);
								var medicationOrderId;
								if (searchResponse.total > 0) {
									medicationOrderId = searchResponse.entry[0].resource.id;
									appendLog("Client MedicationOrder " + id + " already exists in database as Aggregate MedicationOrder " + medicationOrderId);
									sendResourceToAgency("MedicationOrder", medicationOrderId);
									return medicationOrderId;
								} else {
									appendLog("Client MedicationOrder " + id + " not a duplicate. Persisting...");
									delete response.id;
									return postRequest(baseUrl + "/MedicationOrder", JSON.stringify(response))
									.then(function(saveResponse, textStatus, request) {
										var location = request.getResponseHeader("Location");
										var start = location.indexOf(baseUrl + "/MedicationOrder/") + (baseUrl + "/MedicationOrder/").length;
										var end = location.indexOf("/_history");
										medicationOrderId = location.substring(start, end);
										appendLog("Client MedicationOrder " + id + " saved as Aggregate MedicationOrder " + medicationOrderId + ".");
										console.log(saveResponse);							
										sendResourceToAgency("MedicationOrder", medicationOrderId);
										return medicationOrderId;
									})
									.fail(function(err) {
										appendLog("Failed while creating new resource for client medicationOrder " + id);
									});
								}
							})
							.fail(function(err) {
								appendLog("Failed while checking for duplicate of client medicationOrder " + id);
							});
						})
						.fail(function(err) {
							appendLog("Failed while updating prescriber reference for client medicationOrder" + id);
						});
					} else {
						appendLog("Client MedicationOrder/" + id + " has no prescriber reference. Not persisting.")
					}
				})
				.fail(function(err) {
					appendLog("Failed while updating patient reference for client medicationOrder " + id);
				});
			} else {
				appendLog("Client MedicationOrder " + id + " has no patient reference. Not persisting.")
			}
		})
		.fail(function(err) {
			appendLog("Could not process medicationOrder with id " + id);
			console.log(err);
		});
	};
}