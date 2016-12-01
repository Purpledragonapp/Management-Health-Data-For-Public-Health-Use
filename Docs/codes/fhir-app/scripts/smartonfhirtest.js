var baseUrl = "http://ec2-35-162-112-117.us-west-2.compute.amazonaws.com:8080/hapi-fhir-jpaserver-example/baseDstu2";

var clientUrls = {
	'client1': 'http://ec2-35-164-207-196.us-west-2.compute.amazonaws.com:8080/hapi-fhir-jpaserver-example/baseDstu2',
	'client2': 'http://ec2-35-164-48-104.us-west-2.compute.amazonaws.com:8080/hapi-fhir-jpaserver-example/baseDstu2',
	'client3': 'http://ec2-35-161-74-59.us-west-2.compute.amazonaws.com:8080/hapi-fhir-jpaserver-example/baseDstu2'
};

var activeClient;

var agencyUrl = 'http://ec2-35-163-169-229.us-west-2.compute.amazonaws.com:8080/hapi-fhir-jpaserver-example/baseDstu2';

function _ajax_request(url, data, callback, method) {
	return $.ajax({
		url: url,
		type: method,
		data: data,
		headers: {
			'Content-Type': 'application/json+fhir'
		},
		success: callback
	});
}

function getRequest(url) {
	return $.get(url);
}

function postRequest(url, data) {
	return _ajax_request(url, data, null, 'POST');
}

function getClientResourcesFromList() {
	var pageLog = document.getElementById("pageLog").innerHTML;
	var clientUrl = clientUrls[document.getElementById("clientSelect").value];
	var resource = document.getElementById("resourceSelect").value;
	var resList = document.getElementById("resourceIdList").value;

	pageLog = "";

	resArray = resList.split(",");

	var smartClient = FHIR.client({
		serviceUrl: clientUrl
	});

	for (var i in resArray) {
		getResource(clientUrl, resource, resArray[i], response);
	}
}

function getResource(clientUrl, resource, resId, response) {
	//res = smartClient.api.read({type: resource, id: resId});
	var res = getRequest(clientUrl + "/" + resource + "/" + resId);
	res.fail(function(err) {
		console.log(err);
		response.innerHTML += "-----<br>Could not find " + resource + " " + resId + "<br>";
	}).done(function(retRes) {
		console.log(retRes);
		var resString = JSON.stringify(retRes, null, 4);
		response.innerHTML += '-----<div class="well" style="white-space: pre-wrap; word-wrap: break-word">' + resString + '<br>';
		var query = baseUrl + "/" + resource + "?";
		if (resource == 'Patient') {
			for (var i in retRes.name) {
				for (var j=0; j < retRes.name[i].family.length; j++) {
					query += "&family=" + retRes.name[i].family[j];
				}
				for (var j=0; j < retRes.name[i].given.length; j++) {
					query += "&given=" + retRes.name[i].given[j];
				}
			}
			query += "&gender=" + retRes.gender;
			query = query.replace("?&", "?");
			console.log(query)
			searchRes = getRequest(query);
			searchRes.fail(function(err){
				console.log('query fail');
				console.log(err);
			}).done(function(searchResp) {
				console.log('query success');
				console.log(searchResp);
				if (searchResp.total > 0) {
					console.log('resource already exists, not created');
				} else {
					console.log('saving resource' + resource + ' ' + resId);
					delete retRes.id
					console.log(retRes);
					resString = JSON.stringify(retRes, null, 4);
					response.innerHTML += '----------<div class="well" style="white-space: pre-wrap; word-wrap: break-word">' + resString + '<br>';
					postRequest(baseUrl + "/" + resource, JSON.stringify(retRes), function(result) {
						console.log(result);
					});
				}
			});
		} else if (resource == 'Observation') {

		}		
	});
}

function appendLog(text) {
	$("#pageLog").text(function(i, origText) {
		return origText + "\n" + text;
	});
	$("#pageLog").scrollTop($("#pageLog")[0].scrollHeight);
}

function processPatient(id) {
	appendLog("Fetching Client Patient " + id + "...");
	return getRequest(activeClient + "/Patient/" + id)
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
			if (searchResponse.total > 0) {
				patientId = searchResponse.entry[0].resource.id;
				appendLog("Client Patient " + id + " already exists in database as Aggregate Patient " + patientId);
				return patientId;
			} else {
				appendLog("Client Patient " + id + " not a duplicate. Persisting...");
				delete response.id;
				return postRequest(baseUrl + "/Patient", JSON.stringify(response))
				.then(function(saveResponse, textStatus, request) {
					var location = request.getResponseHeader("Location");
					var start = location.indexOf(baseUrl + "/Patient/") + (baseUrl + "/Patient/").length;
					var end = location.indexOf("/_history");
					patientId = location.substring(start, end);
					appendLog("Client Patient " + id + " saved as Aggregate Patient " + patientId + ".");
					console.log(saveResponse);
					return patientId;
				})
				.fail(function(err) {
					appendLog("Failed while creating new resource.");
				});
			}
		})
		.fail(function(err) {
			appendLog("Failed while checking for duplicate.");
		});
	})
	.fail(function(err) {
		appendLog("Could not process patient with id " + id);
		console.log("response error");
		console.log(err);
	});
}

function processObservation(id) {
	appendLog("Fetching Client Observation " + id + "...");
	return getRequest(activeClient + "/Observation/" + id)
	.then(function(response) {
		appendLog("Client Observation " + id + " found.");
		console.log(response);
		appendLog("Updating Patient refernce...");
		return processPatient(response.subject.reference.split("/")[1])
		.then(function(newPatientId) {
			response.subject.reference = "Patient/" + newPatientId;
			appendLog("Updated Patient reference to Patient/" + newPatientId);
			appendLog("Checking for duplicate...");
			var search = baseUrl + "/Observation?";
			for (var i in response.code.coding) {
				search += "&code=" + response.code.coding[i].system + "|" + response.code.coding[i].code;
			}
			search += "&subject=" + response.subject.reference;
			search += "&value-quantity=" + response.valueQuantity.value + "|" + response.valueQuantity.system + "|" + response.valueQuantity.code;
			search = search.replace("?&", "?");
			return getRequest(search)
			.then(function(searchResponse) {
				console.log(searchResponse);
				var observationId;
				if (searchResponse.total > 0) {
					observationId = searchResponse.entry[0].resource.id;
					appendLog("Client Observation " + id + " already exists in database as Aggregate Observation " + observationId);
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
						return observationId;
					})
					.fail(function(err) {
						appendLog("Failed while creating new resource.");
					});
				}
			})
			.fail(function(err) {
				appendLog("Failed while checking for duplicate.");
			});
		})
		.fail(function(err) {
			appendLog("Failed while updating patient reference.");
		});
	})
	.fail(function(err) {
		appendLog("Could not process observation with id " + id);
		console.log(err);
	});
}

$(document).ready(function() {
	$("#processButton").click(function() {
		activeClient = clientUrls[$("#clientSelect").val()]
		appendLog("Working with " + $("#clientSelect").val() + "at url:")
		appendLog(activeClient);
		var patients = $("#patientList").val().split(",");
		var observations = $("#observationList").val().split(",");
		// var conditions = $("#conditionList").val().split(",");
		for (var i in patients) {
			if (!isNaN(parseInt(patients[i]))) {
				processPatient(patients[i].trim());
			}
		}
		for (var i in observations) {
			if (!isNaN(parseInt(observations[i]))) {
				processObservation(observations[i].trim());
			}
		}
		// for (var i in conditions) {
		// 	appendLog(conditions[i]);
		// }
	});
});