// screens/LoginScreen.tsx — User login screen.
//
// Sends credentials to POST /users/login, receives a JWT, decodes the payload
// to extract user_id and email, then stores the token + identity in the Keychain
// via AuthContext.setAuth(). After setAuth() resolves, App.tsx sees a non-null
// user and automatically navigates to the HomeScreen — no manual navigation.navigate() needed.

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
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { loginUser } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Colors, Spacing, Typography } from '../theme';
import { RootStackParamList } from '../../App';
import { jwtDecode } from 'jwt-decode'; // Decodes the JWT to extract payload without verifying signature

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Login'>;
};

// Shape of the JWT payload returned by POST /users/login
// (matches what users.ts signs: { user_id, email, iat, exp })
interface JWTPayload {
  user_id: number;
  email: string;
}

export default function LoginScreen({ navigation }: Props) {
  const { setAuth } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Email and password are required.');
      return;
    }
    setLoading(true);
    try {
      const res = await loginUser({ email, password });
      const { token } = res.data as { message: string; token: string };
      // Decode the JWT client-side to extract user_id and email.
      // jwtDecode() does NOT verify the signature — it just parses the base64 payload.
      // Signature verification happens on the backend for each protected request.
      const payload = jwtDecode<JWTPayload>(token);
      // Store token + identity in Keychain and update React state.
      // After this, App.tsx sees non-null user and swaps to the authenticated screen set.
      await setAuth(token, { user_id: payload.user_id, email: payload.email });
      // Navigation handled by App.tsx auth state — no navigation.navigate() needed here
    } catch (err: any) {
      const msg =
        err?.response?.data?.error || 'Login failed. Check your credentials.';
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
        <Text style={styles.subtitle}>Sign in to your account</Text>

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
          placeholder="Password"
          placeholderTextColor={Colors.midGray}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}>
          <Text style={styles.buttonText}>
            {loading ? 'Signing in…' : 'Log In'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Register')}>
          <Text style={styles.link}>Don't have an account? Register</Text>
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
