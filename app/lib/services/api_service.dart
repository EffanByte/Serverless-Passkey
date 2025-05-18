import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiService {
  static const String baseUrl = 'http://localhost:5000/api';

  // Sign up a new user
  static Future<Map<String, dynamic>> signUp({
    required String fullName,
    required String email,
    required String password,
  }) async {
    try {
      print('Making signup request to: $baseUrl/signup');
      print(
        'Request body: ${jsonEncode({'fullName': fullName, 'email': email, 'password': password})}',
      );

      final response = await http.post(
        Uri.parse('$baseUrl/signup'),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: jsonEncode({
          'fullName': fullName,
          'email': email,
          'password': password,
        }),
      );

      print('Response status code: ${response.statusCode}');
      print('Response headers: ${response.headers}');
      print('Response body: ${response.body}');

      if (response.body.isEmpty) {
        print('Empty response body received');
        return {'success': false, 'message': 'Empty response from server'};
      }

      try {
        final data = jsonDecode(response.body);
        print('Parsed response data: $data');

        if (response.statusCode == 201) {
          return {
            'success': true,
            'user': data['user'],
            'token': data['token'],
          };
        } else {
          return {
            'success': false,
            'message': data['message'] ?? 'An error occurred',
          };
        }
      } catch (e) {
        print('JSON parsing error: $e');
        print('Raw response body: ${response.body}');
        return {
          'success': false,
          'message': 'Invalid response from server: ${e.toString()}',
        };
      }
    } catch (e) {
      print('Network error: $e');
      return {'success': false, 'message': 'Network error: ${e.toString()}'};
    }
  }
}
