// screens/RegisterScreen.tsx — New account registration screen.
//
// Calls POST /users/register with name, email, phone_number, and password.
// On success, shows an alert and navigates the user to LoginScreen.
// Registration does NOT log the user in — they must sign in after registering.
// (This avoids duplicating login logic and keeps the auth flow linear.)

import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { registerUser } from '../services/api';
import { Colors, Spacing, Typography } from '../theme';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Register'>;
};

export default function RegisterScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    // Basic client-side validation before hitting the network
    if (!name || !email || !phone || !password) {
      Alert.alert('Error', 'All fields are required.');
      return;
    }
    setLoading(true);
    try {
      // POST /users/register — returns { message, user_id } on 201
      await registerUser({ name, email, phone_number: phone, password });
      // Registration succeeded — prompt the user to log in (no auto-login)
      Alert.alert('Account created', 'Please log in to continue.', [
        { text: 'OK', onPress: () => navigation.navigate('Login') },
      ]);
    } catch (err: any) {
      // Backend returns specific error messages (e.g. "email already exists")
      const msg =
        err?.response?.data?.error || 'Registration failed. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>SoleSignal</Text>
        <Text style={styles.subtitle}>Create your account</Text>

        <TextInput
          style={styles.input}
          placeholder="Full name"
          placeholderTextColor={Colors.midGray}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />
        <TextInput
          style={styles.input}
          placeholder="Email address"
          placeholderTextColor={Colors.midGray}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Phone number"
          placeholderTextColor={Colors.midGray}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <TextInput
          style={styles.input}
          placeholder="Password (min 8 characters)"
          placeholderTextColor={Colors.midGray}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}>
          <Text style={styles.buttonText}>
            {loading ? 'Creating account…' : 'Register'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.link}>Already have an account? Log in</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.white },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  logo: {
    ...Typography.heading,
    fontSize: 32,
    color: Colors.scarlet,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    color: Colors.midGray,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.lightGray,
    borderRadius: 8,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    fontSize: 16,
    color: Colors.black,
    backgroundColor: Colors.lightGray,
  },
  button: {
    backgroundColor: Colors.scarlet,
    borderRadius: 8,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  link: {
    textAlign: 'center',
    color: Colors.scarlet,
    fontSize: 14,
  },
});
